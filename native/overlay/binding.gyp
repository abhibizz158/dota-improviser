{
  "targets": [{
    "target_name": "overlay_window",
    "defines": ["NAPI_VERSION=8"],
    "conditions": [
      ["OS=='mac'", {
        "sources": ["window.mm"],
        "libraries": ["-framework AppKit", "-framework CoreGraphics"],
        "xcode_settings": {"CLANG_ENABLE_OBJC_ARC": "YES", "MACOSX_DEPLOYMENT_TARGET": "12.0"}
      }],
      ["OS=='win'", {
        "sources": ["window.cc"],
        "libraries": ["user32.lib"],
        "defines": ["_WIN32_WINNT=0x0A00"]
      }]
    ]
  }]
}
