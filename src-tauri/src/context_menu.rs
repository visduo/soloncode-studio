use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};

const REMIX_ICON_CSS: &str = include_str!("../../node_modules/remixicon/fonts/remixicon.css");
const REMIX_ICON_FONT: &[u8] = include_bytes!("../../node_modules/remixicon/fonts/remixicon.woff2");
const DISABLE_CONTEXT_MENU_SCRIPT: &str = include_str!("context_menu.js");

pub(crate) fn context_menu_script() -> String {
    let font_data = BASE64_STANDARD.encode(REMIX_ICON_FONT);
    let font_face_start = REMIX_ICON_CSS
        .find("@font-face")
        .expect("Remix Icon CSS must contain @font-face");
    let font_face_end = REMIX_ICON_CSS[font_face_start..]
        .find('}')
        .map(|offset| font_face_start + offset + 1)
        .expect("Remix Icon @font-face must be closed");
    let embedded_font_face = format!(
        "@font-face {{ font-family: \"remixicon\"; src: url(\"data:font/woff2;base64,{font_data}\") format(\"woff2\"); font-display: swap; }}"
    );
    let css = format!(
        "{}{}{}",
        &REMIX_ICON_CSS[..font_face_start],
        embedded_font_face,
        &REMIX_ICON_CSS[font_face_end..]
    );
    DISABLE_CONTEXT_MENU_SCRIPT.replace(
        "__REMIX_ICON_CSS__",
        &serde_json::to_string(&css).expect("Remix Icon CSS must be serializable"),
    )
}
