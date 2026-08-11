use reqwest::{
    header::{HeaderMap, WWW_AUTHENTICATE},
    Client, StatusCode, Url,
};
use serde::Serialize;
use std::time::Duration;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HttpAuthStatus {
    requires_auth: bool,
    realm: Option<String>,
    scheme: Option<String>,
}

fn parse_auth_challenge(headers: &HeaderMap) -> (Option<String>, Option<String>) {
    let mut fallback = (None, None);
    for value in headers.get_all(WWW_AUTHENTICATE) {
        let Ok(challenge) = value.to_str() else {
            continue;
        };
        let challenge = challenge.trim();
        if challenge.is_empty() {
            continue;
        }

        if let Some(basic_challenge) = find_auth_scheme(challenge, "basic") {
            return (
                Some("Basic".to_owned()),
                parse_realm(&challenge[basic_challenge..]),
            );
        }

        let scheme = challenge
            .split_ascii_whitespace()
            .next()
            .map(ToOwned::to_owned);
        let realm = parse_realm(challenge);
        if fallback.0.is_none() && scheme.is_some() {
            fallback = (scheme, realm);
        }
    }
    fallback
}

fn find_auth_scheme(challenge: &str, target: &str) -> Option<usize> {
    let lower = challenge.to_ascii_lowercase();
    lower.match_indices(target).find_map(|(index, matched)| {
        let before = lower[..index].chars().next_back();
        let after = lower[index + matched.len()..].chars().next();
        let starts_token = before.is_none_or(|value| value == ',' || value.is_ascii_whitespace());
        let ends_token = after.is_none_or(|value| value == ',' || value.is_ascii_whitespace());
        (starts_token && ends_token).then_some(index)
    })
}

fn parse_realm(challenge: &str) -> Option<String> {
    let lower = challenge.to_ascii_lowercase();
    let marker = "realm=";
    let start = lower.find(marker)? + marker.len();
    let value = challenge[start..].trim_start();
    if let Some(quoted) = value.strip_prefix('"') {
        let mut escaped = false;
        let mut realm = String::new();
        for character in quoted.chars() {
            if escaped {
                realm.push(character);
                escaped = false;
            } else if character == '\\' {
                escaped = true;
            } else if character == '"' {
                return Some(realm);
            } else {
                realm.push(character);
            }
        }
        return None;
    }

    let realm = value
        .split([',', ' ', '\t'])
        .next()
        .unwrap_or_default()
        .trim();
    (!realm.is_empty()).then(|| realm.to_owned())
}

#[tauri::command]
pub(crate) async fn check_http_auth(
    url: String,
    username: Option<String>,
    password: Option<String>,
) -> Result<HttpAuthStatus, String> {
    let parsed_url = Url::parse(&url).map_err(|error| format!("Invalid URL: {error}"))?;
    if parsed_url.scheme() != "http" && parsed_url.scheme() != "https" {
        return Err("Only HTTP and HTTPS URLs can be checked".to_owned());
    }

    let client = Client::builder()
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|error| error.to_string())?;
    let mut request = client.get(parsed_url);
    if let Some(username) = username.filter(|value| !value.is_empty()) {
        request = request.basic_auth(username, password);
    }

    let response = request.send().await.map_err(|error| error.to_string())?;
    let unauthorized = response.status() == StatusCode::UNAUTHORIZED;
    let (scheme, realm) = if unauthorized {
        parse_auth_challenge(response.headers())
    } else {
        (None, None)
    };
    let requires_auth = unauthorized;

    Ok(HttpAuthStatus {
        requires_auth,
        realm,
        scheme,
    })
}

#[cfg(test)]
mod tests {
    use super::{check_http_auth, parse_auth_challenge, parse_realm};
    use reqwest::header::{HeaderMap, HeaderValue, WWW_AUTHENTICATE};
    use std::{
        io::{Read, Write},
        net::TcpListener,
        thread,
    };

    fn basic_auth_server() -> (String, thread::JoinHandle<()>) {
        let listener = TcpListener::bind(("127.0.0.1", 0)).expect("bind test server");
        let address = listener.local_addr().expect("read test server address");
        let handle = thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("accept test request");
            let mut buffer = [0_u8; 4096];
            let length = stream.read(&mut buffer).expect("read test request");
            let request = String::from_utf8_lossy(&buffer[..length]);
            let authenticated = request.lines().any(|line| {
                line.trim()
                    .eq_ignore_ascii_case("authorization: Basic dXNlcjpwYXNz")
            });
            let response = if authenticated {
                "HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok"
            } else {
                "HTTP/1.1 401 Unauthorized\r\nWWW-Authenticate: Basic realm=\"Studio Test\"\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
            };
            stream
                .write_all(response.as_bytes())
                .expect("write test response");
        });
        (format!("http://{address}/"), handle)
    }

    #[test]
    fn parses_quoted_realm() {
        assert_eq!(
            parse_realm(r#"Basic realm="Admin Area""#),
            Some("Admin Area".to_owned())
        );
    }

    #[test]
    fn parses_unquoted_realm() {
        assert_eq!(
            parse_realm("Basic realm=admin, charset=UTF-8"),
            Some("admin".to_owned())
        );
    }

    #[test]
    fn ignores_missing_realm() {
        assert_eq!(parse_realm("Basic charset=UTF-8"), None);
    }

    #[test]
    fn finds_basic_auth_in_combined_challenges() {
        let mut headers = HeaderMap::new();
        headers.insert(
            WWW_AUTHENTICATE,
            HeaderValue::from_static("Negotiate, NTLM, Basic realm=\"Studio Test\""),
        );

        assert_eq!(
            parse_auth_challenge(&headers),
            (Some("Basic".to_owned()), Some("Studio Test".to_owned()))
        );
    }

    #[test]
    fn detects_basic_auth_challenge() {
        let (url, server) = basic_auth_server();
        let status = tauri::async_runtime::block_on(check_http_auth(url, None, None))
            .expect("check auth challenge");
        server.join().expect("join test server");

        assert!(status.requires_auth);
        assert_eq!(status.realm.as_deref(), Some("Studio Test"));
        assert_eq!(status.scheme.as_deref(), Some("Basic"));
    }

    #[test]
    fn accepts_valid_basic_auth_credentials() {
        let (url, server) = basic_auth_server();
        let status = tauri::async_runtime::block_on(check_http_auth(
            url,
            Some("user".to_owned()),
            Some("pass".to_owned()),
        ))
        .expect("check valid credentials");
        server.join().expect("join test server");

        assert!(!status.requires_auth);
    }
}
