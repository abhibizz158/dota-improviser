#import <AppKit/AppKit.h>
#import <CoreGraphics/CoreGraphics.h>
#include "result.h"

static napi_value ForegroundBounds(napi_env env, napi_callback_info) {
  @autoreleasepool {
    NSRunningApplication* app = NSWorkspace.sharedWorkspace.frontmostApplication;
    if (![app.bundleIdentifier isEqualToString:@"com.valvesoftware.dota2"]) return NoWindow(env);

    // Only use geometry for Dota's foreground window. No pixels, titles, or game state.
    NSArray<NSDictionary*>* windows = CFBridgingRelease(CGWindowListCopyWindowInfo(
      kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements, kCGNullWindowID));
    for (NSDictionary* window in windows) {
      if ([window[(__bridge NSString*)kCGWindowOwnerPID] intValue] != app.processIdentifier ||
          [window[(__bridge NSString*)kCGWindowLayer] intValue] != 0) continue;
      NSDictionary* metadata = window[(__bridge NSString*)kCGWindowBounds];
      CGRect bounds;
      if (metadata && CGRectMakeWithDictionaryRepresentation((__bridge CFDictionaryRef)metadata, &bounds) &&
          bounds.size.width >= 320 && bounds.size.height >= 240) {
        return WindowBounds(env, bounds.origin.x, bounds.origin.y, bounds.size.width, bounds.size.height);
      }
    }
    return NoWindow(env);
  }
}

NAPI_MODULE_INIT() {
  napi_value fn;
  napi_create_function(env, nullptr, 0, ForegroundBounds, nullptr, &fn);
  napi_set_named_property(env, exports, "foregroundBounds", fn);
  return exports;
}
