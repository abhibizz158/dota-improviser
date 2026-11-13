#pragma once
#include <node_api.h>

inline napi_value NoWindow(napi_env env) {
  napi_value result;
  napi_get_null(env, &result);
  return result;
}

inline napi_value WindowBounds(napi_env env, double x, double y, double width, double height) {
  napi_value result;
  napi_create_object(env, &result);
  const char* keys[] = {"x", "y", "width", "height"};
  const double values[] = {x, y, width, height};
  for (int i = 0; i < 4; ++i) {
    napi_value value;
    napi_create_double(env, values[i], &value);
    napi_set_named_property(env, result, keys[i], value);
  }
  return result;
}
