use aes_gcm::{
    aead::{Aead, KeyInit, Payload},
    Aes256Gcm, Nonce,
};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use rand::{rngs::OsRng, RngCore};
use std::sync::Mutex;
use zeroize::Zeroizing;

const APP_IDENTIFIER: &str = "cn.duozai.soloncodestudio";
const KEYRING_ACCOUNT: &str = "local-storage-master-key";
const ENCRYPTED_PREFIX: &str = "scenc:v1:";
const NONCE_LENGTH: usize = 12;
const AUTH_TAG_LENGTH: usize = 16;
const KEY_LENGTH: usize = 32;

const ALLOWED_STORAGE_KEYS: &[&str] = &[
    "soloncode.workspaces",
    "soloncode.workspaceAliases",
    "soloncode.workspaceGroups",
    "soloncode.hiddenStudioUpdate",
    "soloncode.terminalSettings",
    "soloncode.preferences",
    "soloncode.javaExecutable",
    "soloncode.closeWindowBehavior",
    "soloncode.selectedWorkspace",
];

pub struct SecureStorageState {
    key: Mutex<Option<Zeroizing<[u8; KEY_LENGTH]>>>,
}

impl Default for SecureStorageState {
    fn default() -> Self {
        Self {
            key: Mutex::new(None),
        }
    }
}

fn ensure_allowed_key(key: &str) -> Result<(), String> {
    if ALLOWED_STORAGE_KEYS.contains(&key) {
        Ok(())
    } else {
        Err("不允许访问该本地存储项".to_string())
    }
}

fn associated_data(key: &str) -> String {
    format!("{APP_IDENTIFIER}:local-storage:{key}:v1")
}

fn decode_master_key(value: &str) -> Result<Zeroizing<[u8; KEY_LENGTH]>, String> {
    let decoded = URL_SAFE_NO_PAD
        .decode(value)
        .map_err(|_| "系统安全存储中的本地主密钥格式无效".to_string())?;
    let key: [u8; KEY_LENGTH] = decoded
        .try_into()
        .map_err(|_| "系统安全存储中的本地主密钥长度无效".to_string())?;
    Ok(Zeroizing::new(key))
}

fn create_master_key(entry: &keyring::Entry) -> Result<Zeroizing<[u8; KEY_LENGTH]>, String> {
    let mut key = Zeroizing::new([0_u8; KEY_LENGTH]);
    OsRng.fill_bytes(key.as_mut());
    entry
        .set_password(&URL_SAFE_NO_PAD.encode(key.as_ref()))
        .map_err(|error| format!("无法将本地主密钥写入系统安全存储：{error}"))?;
    Ok(key)
}

fn load_or_create_master_key(
    has_encrypted_data: bool,
) -> Result<Zeroizing<[u8; KEY_LENGTH]>, String> {
    let entry = keyring::Entry::new(APP_IDENTIFIER, KEYRING_ACCOUNT)
        .map_err(|error| format!("无法访问系统安全存储：{error}"))?;

    match entry.get_password() {
        Ok(value) => decode_master_key(&value),
        Err(keyring::Error::NoEntry) if has_encrypted_data => Err(
            "检测到已加密的本地数据，但系统安全存储中的主密钥已丢失；为避免覆盖原数据，已停止初始化"
                .to_string(),
        ),
        Err(keyring::Error::NoEntry) => create_master_key(&entry),
        Err(error) => Err(format!("无法从系统安全存储读取本地主密钥：{error}")),
    }
}

fn with_master_key<T>(
    state: &SecureStorageState,
    action: impl FnOnce(&[u8; KEY_LENGTH]) -> Result<T, String>,
) -> Result<T, String> {
    let guard = state
        .key
        .lock()
        .map_err(|_| "本地加密状态不可用".to_string())?;
    let key = guard
        .as_ref()
        .ok_or_else(|| "本地加密存储尚未初始化".to_string())?;
    action(key)
}

#[tauri::command]
pub fn initialize_secure_storage(
    state: tauri::State<'_, SecureStorageState>,
    has_encrypted_data: bool,
) -> Result<(), String> {
    let mut guard = state
        .key
        .lock()
        .map_err(|_| "本地加密状态不可用".to_string())?;
    if guard.is_none() {
        *guard = Some(load_or_create_master_key(has_encrypted_data)?);
    }
    Ok(())
}

#[tauri::command]
pub fn encrypt_local_storage_item(
    state: tauri::State<'_, SecureStorageState>,
    key: String,
    plaintext: String,
) -> Result<String, String> {
    ensure_allowed_key(&key)?;
    with_master_key(&state, |master_key| {
        let cipher = Aes256Gcm::new_from_slice(master_key)
            .map_err(|_| "无法初始化本地加密器".to_string())?;
        let mut nonce_bytes = [0_u8; NONCE_LENGTH];
        OsRng.fill_bytes(&mut nonce_bytes);
        let ciphertext = cipher
            .encrypt(
                Nonce::from_slice(&nonce_bytes),
                Payload {
                    msg: plaintext.as_bytes(),
                    aad: associated_data(&key).as_bytes(),
                },
            )
            .map_err(|_| "本地数据加密失败".to_string())?;

        let mut payload = Vec::with_capacity(nonce_bytes.len() + ciphertext.len());
        payload.extend_from_slice(&nonce_bytes);
        payload.extend_from_slice(&ciphertext);
        Ok(format!(
            "{ENCRYPTED_PREFIX}{}",
            URL_SAFE_NO_PAD.encode(payload)
        ))
    })
}

#[tauri::command]
pub fn decrypt_local_storage_item(
    state: tauri::State<'_, SecureStorageState>,
    key: String,
    payload: String,
) -> Result<String, String> {
    ensure_allowed_key(&key)?;
    let encoded = payload
        .strip_prefix(ENCRYPTED_PREFIX)
        .ok_or_else(|| "不支持的本地加密数据格式".to_string())?;
    let decoded = URL_SAFE_NO_PAD
        .decode(encoded)
        .map_err(|_| "本地加密数据格式无效".to_string())?;
    if decoded.len() < NONCE_LENGTH + AUTH_TAG_LENGTH {
        return Err("本地加密数据不完整".to_string());
    }
    let (nonce_bytes, ciphertext) = decoded.split_at(NONCE_LENGTH);

    with_master_key(&state, |master_key| {
        let cipher = Aes256Gcm::new_from_slice(master_key)
            .map_err(|_| "无法初始化本地解密器".to_string())?;
        let plaintext = cipher
            .decrypt(
                Nonce::from_slice(nonce_bytes),
                Payload {
                    msg: ciphertext,
                    aad: associated_data(&key).as_bytes(),
                },
            )
            .map_err(|_| "本地数据解密失败，数据可能已损坏或主密钥不匹配".to_string())?;
        String::from_utf8(plaintext).map_err(|_| "解密后的本地数据不是有效文本".to_string())
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn encrypt_with_key(key_name: &str, plaintext: &str, master_key: &[u8; KEY_LENGTH]) -> String {
        let cipher = Aes256Gcm::new_from_slice(master_key).unwrap();
        let nonce_bytes = [7_u8; NONCE_LENGTH];
        let ciphertext = cipher
            .encrypt(
                Nonce::from_slice(&nonce_bytes),
                Payload {
                    msg: plaintext.as_bytes(),
                    aad: associated_data(key_name).as_bytes(),
                },
            )
            .unwrap();
        let mut payload = nonce_bytes.to_vec();
        payload.extend(ciphertext);
        format!("{ENCRYPTED_PREFIX}{}", URL_SAFE_NO_PAD.encode(payload))
    }

    fn decrypt_with_key(
        key_name: &str,
        payload: &str,
        master_key: &[u8; KEY_LENGTH],
    ) -> Result<String, String> {
        let encoded = payload.strip_prefix(ENCRYPTED_PREFIX).unwrap();
        let decoded = URL_SAFE_NO_PAD.decode(encoded).unwrap();
        let (nonce, ciphertext) = decoded.split_at(NONCE_LENGTH);
        let cipher = Aes256Gcm::new_from_slice(master_key).unwrap();
        let plaintext = cipher
            .decrypt(
                Nonce::from_slice(nonce),
                Payload {
                    msg: ciphertext,
                    aad: associated_data(key_name).as_bytes(),
                },
            )
            .map_err(|_| "decrypt failed".to_string())?;
        String::from_utf8(plaintext).map_err(|error| error.to_string())
    }

    #[test]
    fn encrypted_value_round_trips() {
        let key = [11_u8; KEY_LENGTH];
        let encrypted = encrypt_with_key("soloncode.preferences", "{\"theme\":\"dark\"}", &key);
        assert!(encrypted.starts_with(ENCRYPTED_PREFIX));
        assert_eq!(
            decrypt_with_key("soloncode.preferences", &encrypted, &key).unwrap(),
            "{\"theme\":\"dark\"}"
        );
    }

    #[test]
    fn associated_data_prevents_copying_between_keys() {
        let key = [13_u8; KEY_LENGTH];
        let encrypted = encrypt_with_key("soloncode.preferences", "secret", &key);
        assert!(decrypt_with_key("soloncode.workspaces", &encrypted, &key).is_err());
    }

    #[test]
    fn a_different_master_key_cannot_decrypt() {
        let encrypted = encrypt_with_key("soloncode.preferences", "secret", &[17_u8; KEY_LENGTH]);
        assert!(
            decrypt_with_key("soloncode.preferences", &encrypted, &[18_u8; KEY_LENGTH]).is_err()
        );
    }

    #[test]
    fn storage_key_allowlist_rejects_unknown_keys() {
        assert!(ensure_allowed_key("soloncode.preferences").is_ok());
        assert!(ensure_allowed_key("untrusted.key").is_err());
    }
}
