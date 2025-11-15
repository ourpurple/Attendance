# 微信登录功能配置说明

## 一、数据库迁移

### 方法1：使用 SQLite（推荐用于开发）

如果使用 SQLite，数据库会自动创建新字段。如果数据库已存在，需要手动添加字段：

```sql
ALTER TABLE users ADD COLUMN wechat_openid VARCHAR(128);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_wechat_openid ON users(wechat_openid);
```

或者运行提供的迁移脚本：
```bash
sqlite3 attendance.db < backend/migrations/add_wechat_openid.sql
```

### 方法2：重新创建数据库（开发环境）

删除现有数据库文件，重新启动应用，数据库会自动创建包含新字段的表。

## 二、配置微信小程序信息

### 1. 获取微信小程序 AppID 和 AppSecret

1. 登录 [微信公众平台](https://mp.weixin.qq.com/)
2. 进入"开发" -> "开发管理" -> "开发设置"
3. 找到"AppID(小程序ID)" 和 "AppSecret(小程序密钥)"
4. 如果 AppSecret 未显示，点击"重置"生成新的密钥

### 2. 配置环境变量

在项目根目录的 `.env` 文件中添加：

```env
WECHAT_APPID=你的微信小程序AppID
WECHAT_SECRET=你的微信小程序AppSecret
```

**示例**：
```env
WECHAT_APPID=wx1234567890abcdef
WECHAT_SECRET=abcdef1234567890abcdef1234567890
```

### 3. 安装依赖

确保已安装 `httpx` 库：

```bash
pip install httpx==0.25.2
```

或重新安装所有依赖：

```bash
pip install -r requirements.txt
```

## 三、API 接口说明

### 1. 微信登录接口

**接口地址**: `POST /api/auth/wechat-login`

**请求参数**:
```json
{
  "code": "微信登录code（通过wx.login获取）"
}
```

**响应情况**:

#### 已绑定账号（自动登录成功）
**状态码**: `200`
**响应**:
```json
{
  "access_token": "JWT token",
  "token_type": "bearer"
}
```

#### 未绑定账号（需要绑定）
**状态码**: `404`
**响应**:
```json
{
  "detail": "需要绑定账号"
}
```

### 2. 账号密码登录接口（支持绑定微信）

**接口地址**: `POST /api/auth/login`

**请求参数**:
```json
{
  "username": "用户名",
  "password": "密码",
  "wechat_code": "微信登录code（可选，如果存在则进行绑定）"
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
- 如果请求中包含 `wechat_code`，后端会：
  1. 通过 `code` 获取用户的 `openid`
  2. 验证账号密码
  3. 将 `openid` 与用户账号绑定
  4. 返回 token

## 四、工作流程

### 首次登录流程：

1. 用户打开小程序
2. 小程序调用 `wx.login` 获取 `code`
3. 调用 `/api/auth/wechat-login`，返回 404（未绑定）
4. 显示登录页，提示"首次使用需要绑定账号"
5. 用户输入账号密码
6. 调用 `/api/auth/login` 并带上 `wechat_code`
7. 后端验证账号密码，绑定 OpenID，返回 token
8. 登录成功

### 再次登录流程：

1. 用户打开小程序
2. 小程序调用 `wx.login` 获取 `code`
3. 调用 `/api/auth/wechat-login`
4. 后端检查 OpenID 已绑定，直接返回 token
5. 自动登录成功，无需输入账号密码

## 五、测试

### 1. 测试微信登录接口

使用 Postman 或 curl 测试：

```bash
curl -X POST "http://localhost:8000/api/auth/wechat-login" \
  -H "Content-Type: application/json" \
  -d '{"code": "测试code"}'
```

**注意**: 真实的 `code` 只能通过小程序 `wx.login` 获取，且只能使用一次，有效期5分钟。

### 2. 测试账号密码登录（绑定微信）

```bash
curl -X POST "http://localhost:8000/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "password": "testpass",
    "wechat_code": "测试code"
  }'
```

## 六、常见问题

### 1. 错误：微信配置未设置

**原因**: `.env` 文件中未配置 `WECHAT_APPID` 或 `WECHAT_SECRET`

**解决**: 检查 `.env` 文件，确保两个配置都已设置

### 2. 错误：获取微信OpenID失败

**可能原因**:
- `code` 已过期（有效期5分钟）
- `code` 已使用过（只能使用一次）
- AppID 或 AppSecret 配置错误
- 网络问题

**解决**: 
- 检查配置是否正确
- 确保使用最新的 `code`
- 检查网络连接

### 3. 错误：该微信账号已被其他用户绑定

**原因**: 该 OpenID 已经绑定到其他用户账号

**解决**: 一个微信账号只能绑定一个用户账号

### 4. 数据库字段不存在

**原因**: 数据库未迁移，缺少 `wechat_openid` 字段

**解决**: 运行数据库迁移脚本或重新创建数据库

## 七、安全注意事项

1. **AppSecret 保密**: 不要将 AppSecret 提交到代码仓库，使用环境变量管理
2. **HTTPS**: 生产环境必须使用 HTTPS
3. **Token 过期**: Token 默认7天过期，可根据需要调整
4. **OpenID 唯一性**: 确保 OpenID 字段的唯一性约束

## 八、生产环境部署

1. 确保 `.env` 文件中的配置正确
2. 确保数据库已迁移（包含 `wechat_openid` 字段）
3. 确保使用 HTTPS
4. 在微信公众平台配置服务器域名
5. 测试微信登录功能是否正常

