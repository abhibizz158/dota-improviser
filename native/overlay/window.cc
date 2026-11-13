#include <windows.h>
#include "result.h"

static napi_value ForegroundBounds(napi_env env, napi_callback_info) {
  HWND window = GetForegroundWindow();
  if (!window || !IsWindowVisible(window) || IsIconic(window)) return NoWindow(env);
  DWORD pid = 0;
  GetWindowThreadProcessId(window, &pid);
  if (!pid || pid == GetCurrentProcessId()) return NoWindow(env);

  // Limited access is only used to confirm the executable path. No process memory access.
  HANDLE process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
  if (!process) return NoWindow(env);
  wchar_t image[2048];
  DWORD length = ARRAYSIZE(image);
  const BOOL found = QueryFullProcessImageNameW(process, 0, image, &length);
  CloseHandle(process);
  if (!found) return NoWindow(env);
  constexpr wchar_t suffix[] = L"\\game\\bin\\win64\\dota2.exe";
  constexpr int suffixLength = ARRAYSIZE(suffix) - 1;
  if (length < suffixLength ||
      CompareStringOrdinal(image + length - suffixLength, suffixLength, suffix, suffixLength, TRUE) != CSTR_EQUAL) return NoWindow(env);

  // Return the actual client area in physical pixels. Electron converts it to display coordinates.
  RECT client;
  POINT origin = {0, 0};
  const auto previous = SetThreadDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
  const BOOL ok = GetClientRect(window, &client) && ClientToScreen(window, &origin);
  RECT visible{};
  if (ok && client.right >= 320 && client.bottom >= 240) {
    RECT bounds = {origin.x, origin.y, origin.x + client.right, origin.y + client.bottom};
    MONITORINFO monitor{};
    monitor.cbSize = sizeof(monitor);
    // Pick and clip in physical coordinates before conversion on mixed-DPI desktops.
    const HMONITOR target = MonitorFromRect(&bounds, MONITOR_DEFAULTTONULL);
    if (target && GetMonitorInfoW(target, &monitor)) {
      IntersectRect(&visible, &bounds, &monitor.rcMonitor);
    }
  }
  if (previous) SetThreadDpiAwarenessContext(previous);
  if (IsRectEmpty(&visible)) return NoWindow(env);
  return WindowBounds(env, visible.left, visible.top, visible.right - visible.left, visible.bottom - visible.top);
}

NAPI_MODULE_INIT() {
  napi_value fn;
  napi_create_function(env, nullptr, 0, ForegroundBounds, nullptr, &fn);
  napi_set_named_property(env, exports, "foregroundBounds", fn);
  return exports;
}
