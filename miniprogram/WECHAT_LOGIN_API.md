# 微信登录 API 接口说明

小程序已实现微信自动登录功能，后端需要提供以下接口：

## 1. 微信登录接口

**接口地址**: `POST /api/auth/wechat-login`

**请求参数**:
```json
{
  "code": "微信登录 code（通过 wx.login 获取）"
}
```

**响应情况**:

### 情况1：已绑定账号，自动登录成功
**状态码**: `200`
**响应**:
```json
{
  "access_token": "JWT token",
  "token_type": "bearer"
}
```

### 情况2：未绑定账号，需要用户输入账号密码
**状态码**: `404` 或 `400`
**响应**:
```json
{
  "detail": "需要绑定账号"
}
```

## 2. 账号密码登录接口（支持绑定微信）

**接口地址**: `POST /api/auth/login`

**请求参数**:
```json
{
  "username": "用户名",
  "password": "密码",
  "wechat_code": "微信登录 code（可选，如果存在则进行绑定）"
}
```

**响应**:
```json
{
  "access_token": "JWT token",
  "token_type": "bearer"
}
```

**说明**:
- 如果请求中包含 `wechat_code`，后端需要：
  1. 通过 `code` 获取用户的 `openid`
  2. 验证账号密码
  3. 将 `openid` 与用户账号绑定
  4. 返回 token

## 3. 后端实现建议

### 获取 OpenID
使用微信提供的接口：
```
GET https://api.weixin.qq.com/sns/jscode2session?appid=APPID&secret=SECRET&js_code=CODE&grant_type=authorization_code
```

响应：
```json
{
  "openid": "用户唯一标识",
  "session_key": "会话密钥"
}
```

### 数据库设计建议
在用户表中添加 `wechat_openid` 字段：
```sql
ALTER TABLE users ADD COLUMN wechat_openid VARCHAR(128) UNIQUE;
```

### 实现流程

1. **微信登录接口** (`/auth/wechat-login`):
   - 接收 `code`
   - 调用微信接口获取 `openid`
   - 查询数据库中是否有该 `openid` 的用户
   - 如果有，返回 token（自动登录）
   - 如果没有，返回 404（需要绑定）

2. **账号密码登录接口** (`/auth/login`):
   - 验证账号密码
   - 如果请求中有 `wechat_code`:
     - 获取 `openid`
     - 将 `openid` 保存到用户记录中
   - 返回 token

## 4. 安全注意事项

1. **AppID 和 AppSecret** 应该保存在后端，不要暴露在小程序中
2. **OpenID** 是用户唯一标识，应该加密存储
3. **Session Key** 不要返回给前端
4. 建议添加绑定次数限制，防止恶意绑定

## 5. 测试

可以使用以下方式测试：

1. **首次登录**:
   - 小程序调用 `wx.login` 获取 `code`
   - 调用 `/auth/wechat-login`，应该返回 404
   - 用户输入账号密码，调用 `/auth/login` 并带上 `wechat_code`
   - 应该成功绑定并登录

2. **再次登录**:
   - 小程序调用 `wx.login` 获取 `code`
   - 调用 `/auth/wechat-login`，应该直接返回 token
   - 用户无需输入账号密码即可登录

