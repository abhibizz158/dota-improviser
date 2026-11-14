#include <windows.h>
#include <cstdint>
#include "result.h"

static bool IsDotaWindow(HWND window) {
  if (!window || !IsWindowVisible(window) || IsIconic(window)) return false;
  DWORD pid = 0;
  GetWindowThreadProcessId(window, &pid);
  if (!pid || pid == GetCurrentProcessId()) return false;

  HANDLE process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
  if (!process) return false;
  wchar_t image[2048];
  DWORD length = ARRAYSIZE(image);
  const BOOL found = QueryFullProcessImageNameW(process, 0, image, &length);
  CloseHandle(process);
  constexpr wchar_t suffix[] = L"\\game\\bin\\win64\\dota2.exe";
  constexpr int suffixLength = ARRAYSIZE(suffix) - 1;
  return found && length >= suffixLength &&
      CompareStringOrdinal(image + length - suffixLength, suffixLength, suffix, suffixLength, TRUE) == CSTR_EQUAL;
}

struct DotaWindow {
  HWND handle;
  long long area;
};

static BOOL CALLBACK FindDotaWindow(HWND window, LPARAM data) {
  RECT client{};
  if (GetWindow(window, GW_OWNER) || !GetClientRect(window, &client) || client.right < 320 || client.bottom < 240) return TRUE;
  auto* best = reinterpret_cast<DotaWindow*>(data);
  const auto area = static_cast<long long>(client.right) * client.bottom;
  if (area > best->area && IsDotaWindow(window)) *best = {window, area};
  return TRUE;
}

static napi_value DotaWindowID(napi_env env, napi_callback_info) {
  DotaWindow best{};
  EnumWindows(FindDotaWindow, reinterpret_cast<LPARAM>(&best));
  if (!best.handle) return NoWindow(env);
  napi_value value;
  napi_create_double(env, static_cast<double>(reinterpret_cast<std::uintptr_t>(best.handle)), &value);
  return value;
}

static napi_value ForegroundBounds(napi_env env, napi_callback_info) {
  HWND window = GetForegroundWindow();
  if (!IsDotaWindow(window)) return NoWindow(env);

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
    const HMONITOR target = MonitorFromRect(&bounds, MONITOR_DEFAULTTONULL);
    if (target && GetMonitorInfoW(target, &monitor)) IntersectRect(&visible, &bounds, &monitor.rcMonitor);
  }
  if (previous) SetThreadDpiAwarenessContext(previous);
  if (IsRectEmpty(&visible)) return NoWindow(env);
  return WindowBounds(env, visible.left, visible.top, visible.right - visible.left, visible.bottom - visible.top);
}

NAPI_MODULE_INIT() {
  napi_value fn;
  napi_create_function(env, nullptr, 0, ForegroundBounds, nullptr, &fn);
  napi_set_named_property(env, exports, "foregroundBounds", fn);
  napi_create_function(env, nullptr, 0, DotaWindowID, nullptr, &fn);
  napi_set_named_property(env, exports, "dotaWindowID", fn);
  return exports;
}
