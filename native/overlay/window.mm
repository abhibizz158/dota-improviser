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

// Match the capture source by the verified window owner, including when the dashboard has focus.
static napi_value DotaWindowID(napi_env env, napi_callback_info) {
  @autoreleasepool {
    NSArray<NSRunningApplication*>* apps = [NSRunningApplication runningApplicationsWithBundleIdentifier:@"com.valvesoftware.dota2"];
    if (apps.count == 0) return NoWindow(env);
    NSArray<NSDictionary*>* windows = CFBridgingRelease(CGWindowListCopyWindowInfo(
      kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements, kCGNullWindowID));
    for (NSDictionary* window in windows) {
      if ([window[(__bridge NSString*)kCGWindowOwnerPID] intValue] != apps.firstObject.processIdentifier ||
          [window[(__bridge NSString*)kCGWindowLayer] intValue] != 0) continue;
      CGRect bounds;
      NSDictionary* metadata = window[(__bridge NSString*)kCGWindowBounds];
      if (!metadata || !CGRectMakeWithDictionaryRepresentation((__bridge CFDictionaryRef)metadata, &bounds) ||
          bounds.size.width < 320 || bounds.size.height < 240) continue;
      napi_value value;
      napi_create_uint32(env, [window[(__bridge NSString*)kCGWindowNumber] unsignedIntValue], &value);
      return value;
    }
    return NoWindow(env);
  }
}

static napi_value RequestScreenRecording(napi_env env, napi_callback_info) {
  napi_value value;
  napi_get_boolean(env, CGRequestScreenCaptureAccess(), &value);
  return value;
}

NAPI_MODULE_INIT() {
  napi_value fn;
  napi_create_function(env, nullptr, 0, ForegroundBounds, nullptr, &fn);
  napi_set_named_property(env, exports, "foregroundBounds", fn);
  napi_create_function(env, nullptr, 0, DotaWindowID, nullptr, &fn);
  napi_set_named_property(env, exports, "dotaWindowID", fn);
  napi_create_function(env, nullptr, 0, RequestScreenRecording, nullptr, &fn);
  napi_set_named_property(env, exports, "requestScreenRecording", fn);
  return exports;
}
