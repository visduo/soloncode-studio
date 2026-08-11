const FRAME_HTTP_AUTH_SCRIPT: &str = include_str!("frame_http_auth.js");

pub(crate) fn frame_http_auth_script() -> &'static str {
    FRAME_HTTP_AUTH_SCRIPT
}
