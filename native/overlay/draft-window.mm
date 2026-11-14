#import <AppKit/AppKit.h>
#import <CoreImage/CoreImage.h>
#import <ScreenCaptureKit/ScreenCaptureKit.h>
#include "result.h"

API_AVAILABLE(macos(15.2))
@interface DraftWindowShare : NSObject <SCContentSharingPickerObserver, SCStreamOutput, SCStreamDelegate>
@property(nonatomic, copy) NSString* state;
@property(nonatomic, strong) SCStream* stream;
@property(nonatomic, strong) CIImage* latestFrame;
@property(nonatomic, strong) CIContext* imageContext;
@property(nonatomic) uint32_t windowID;
@property(nonatomic) double stripFraction;
- (void)open;
- (void)close;
- (NSData*)readStrip;
@end

@implementation DraftWindowShare
- (void)open {
  self.state = @"choosing";
  SCContentSharingPicker* picker = SCContentSharingPicker.sharedPicker;
  SCContentSharingPickerConfiguration* config = [SCContentSharingPickerConfiguration new];
  config.allowedPickerModes = SCContentSharingPickerModeSingleWindow;
  config.allowsChangingSelectedContent = NO;
  picker.defaultConfiguration = config;
  picker.maximumStreamCount = @1;
  [picker addObserver:self];
  picker.active = YES;
  [picker presentPickerUsingContentStyle:SCShareableContentStyleWindow];
}

- (void)close {
  SCContentSharingPicker* picker = SCContentSharingPicker.sharedPicker;
  [picker removeObserver:self];
  picker.active = NO;
  SCStream* stream = self.stream;
  self.stream = nil;
  self.latestFrame = nil;
  if (stream) {
    [stream removeStreamOutput:self type:SCStreamOutputTypeScreen error:nil];
    [stream stopCaptureWithCompletionHandler:nil];
  }
}

- (void)contentSharingPicker:(SCContentSharingPicker*)picker didCancelForStream:(SCStream*)stream {
  dispatch_async(dispatch_get_main_queue(), ^{
    if (![self.state isEqualToString:@"choosing"]) return;
    self.state = @"cancelled";
    [self close];
  });
}

- (void)contentSharingPickerStartDidFailWithError:(NSError*)error {
  dispatch_async(dispatch_get_main_queue(), ^{
    if (![self.state isEqualToString:@"choosing"]) return;
    self.state = @"unavailable";
    [self close];
  });
}

- (void)contentSharingPicker:(SCContentSharingPicker*)picker didUpdateWithFilter:(SCContentFilter*)filter forStream:(SCStream*)previous {
  dispatch_async(dispatch_get_main_queue(), ^{
    if (![self.state isEqualToString:@"choosing"] || previous) return;
    SCWindow* window = filter.includedWindows.firstObject;
    if (filter.style != SCShareableContentStyleWindow || filter.includedWindows.count != 1 || window.windowID != self.windowID ||
        ![window.owningApplication.bundleIdentifier isEqualToString:@"com.valvesoftware.dota2"]) {
      self.state = @"wrong-window";
      [self close];
      return;
    }
    CGSize size = filter.contentRect.size;
    if (size.width < 320 || size.height < 240) {
      self.state = @"unavailable";
      [self close];
      return;
    }
    const double scale = MIN(1, MIN(1600 / size.width, 1000 / size.height));
    SCStreamConfiguration* config = [SCStreamConfiguration new];
    config.width = (size_t)round(size.width * scale);
    config.height = (size_t)round(size.height * scale);
    config.pixelFormat = kCVPixelFormatType_32BGRA;
    config.colorSpaceName = kCGColorSpaceSRGB;
    config.showsCursor = NO;
    config.ignoreShadowsSingleWindow = YES;
    config.ignoreGlobalClipSingleWindow = YES;
    config.queueDepth = 2;
    config.minimumFrameInterval = CMTimeMake(1, 1);
    self.stream = [[SCStream alloc] initWithFilter:filter configuration:config delegate:self];
    NSError* error = nil;
    if (![self.stream addStreamOutput:self type:SCStreamOutputTypeScreen sampleHandlerQueue:dispatch_get_main_queue() error:&error]) {
      self.state = @"unavailable";
      [self close];
      return;
    }
    self.state = @"starting";
    SCStream* stream = self.stream;
    [stream startCaptureWithCompletionHandler:^(NSError* startError) {
      dispatch_async(dispatch_get_main_queue(), ^{
        if (self.stream != stream) {
          [stream stopCaptureWithCompletionHandler:nil];
          return;
        }
        self.state = startError ? @"unavailable" : @"sharing";
        if (startError) [self close];
      });
    }];
  });
}

- (void)stream:(SCStream*)stream didStopWithError:(NSError*)error {
  dispatch_async(dispatch_get_main_queue(), ^{
    if (self.stream != stream) return;
    self.state = @"stopped";
    [self close];
  });
}

- (void)stream:(SCStream*)stream didOutputSampleBuffer:(CMSampleBufferRef)buffer ofType:(SCStreamOutputType)type {
  if (self.stream != stream || type != SCStreamOutputTypeScreen) return;
  NSArray* attachments = (__bridge NSArray*)CMSampleBufferGetSampleAttachmentsArray(buffer, false);
  NSNumber* status = attachments.firstObject[SCStreamFrameInfoStatus];
  if (!status || status.integerValue != SCFrameStatusComplete) return;
  CVImageBufferRef pixels = CMSampleBufferGetImageBuffer(buffer);
  if (!pixels) return;
  CIImage* image = [CIImage imageWithCVPixelBuffer:pixels];
  CGRect crop = image.extent;
  crop.size.height = round(crop.size.height * self.stripFraction);
  crop.origin.y = CGRectGetMaxY(image.extent) - crop.size.height;
  self.latestFrame = [image imageByCroppingToRect:crop];
}

- (NSData*)readStrip {
  CIImage* frame = self.latestFrame;
  if (!frame) return nil;
  if (!self.imageContext) self.imageContext = [CIContext context];
  CGImageRef image = [self.imageContext createCGImage:frame fromRect:frame.extent];
  if (!image) return nil;
  NSBitmapImageRep* bitmap = [[NSBitmapImageRep alloc] initWithCGImage:image];
  CGImageRelease(image);
  return [bitmap representationUsingType:NSBitmapImageFileTypePNG properties:@{}];
}
@end

static DraftWindowShare* windowShare API_AVAILABLE(macos(15.2));

static napi_value StartDraftWindowPicker(napi_env env, napi_callback_info info) {
  if (@available(macOS 15.2, *)) {
    size_t argc = 2;
    napi_value args[2];
    uint32_t windowID;
    double fraction;
    if (napi_get_cb_info(env, info, &argc, args, nullptr, nullptr) != napi_ok || argc != 2 ||
        napi_get_value_uint32(env, args[0], &windowID) != napi_ok || windowID == 0 ||
        napi_get_value_double(env, args[1], &fraction) != napi_ok || !(fraction > 0 && fraction <= 0.1)) return NoWindow(env);
    if (windowShare.stream || [windowShare.state isEqualToString:@"choosing"]) return NoWindow(env);
    windowShare = [DraftWindowShare new];
    windowShare.windowID = windowID;
    windowShare.stripFraction = fraction;
    [windowShare open];
    napi_value result;
    napi_get_boolean(env, true, &result);
    return result;
  }
  return NoWindow(env);
}

static napi_value DraftWindowShareState(napi_env env, napi_callback_info info) {
  NSString* state = @"unsupported";
  if (@available(macOS 15.2, *)) state = windowShare.state ?: @"idle";
  napi_value result;
  napi_create_string_utf8(env, state.UTF8String, NAPI_AUTO_LENGTH, &result);
  return result;
}

static napi_value ReadSharedDraftBar(napi_env env, napi_callback_info info) {
  if (@available(macOS 15.2, *)) {
    NSData* data = [windowShare readStrip];
    if (data.length) {
      napi_value result;
      napi_create_buffer_copy(env, data.length, data.bytes, nullptr, &result);
      return result;
    }
  }
  return NoWindow(env);
}

static napi_value StopDraftWindowShare(napi_env env, napi_callback_info info) {
  if (@available(macOS 15.2, *)) {
    DraftWindowShare* share = windowShare;
    windowShare = nil;
    share.state = @"idle";
    [share close];
  }
  return NoWindow(env);
}

void RegisterDraftWindowShare(napi_env env, napi_value exports) {
  const napi_property_descriptor methods[] = {
    {"startDraftWindowPicker", nullptr, StartDraftWindowPicker, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"draftWindowShareState", nullptr, DraftWindowShareState, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"readSharedDraftBar", nullptr, ReadSharedDraftBar, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"stopDraftWindowShare", nullptr, StopDraftWindowShare, nullptr, nullptr, nullptr, napi_default, nullptr},
  };
  napi_define_properties(env, exports, sizeof(methods) / sizeof(methods[0]), methods);
}
