# 快速修复 "Failed to fetch" 错误

## 问题现象

- 前端页面可以打开
- 登录时提示 "Failed to fetch"
- 浏览器控制台可能显示 CORS 错误或网络错误

## 快速修复步骤

### 1. 检查访问方式

**❌ 错误方式**：直接访问后端端口
```
http://your-ip:8000
http://your-ip:8000/mobile
```

**✅ 正确方式**：通过域名或IP访问（80端口）
```
http://your-domain.com
http://your-ip
```

### 2. 检查 Nginx 配置

在宝塔面板中：

1. 进入 **网站** → 找到你的网站 → 点击 **设置** → **配置文件**
2. 确保 `location /api` 配置正确：

```nginx
# API代理到后端（必须在其他location之前）
location /api {
    proxy_pass http://127.0.0.1:8000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    
    proxy_connect_timeout 60s;
    proxy_send_timeout 60s;
    proxy_read_timeout 60s;
}
```

3. 确保 `location /api` 在 `location /` **之前**
4. 点击 **保存** → **重载配置**

### 3. 检查 CORS 配置

编辑 `.env` 文件（路径：`/www/wwwroot/attendance-system/.env`）：

```env
# 如果使用域名访问
CORS_ORIGINS=["https://your-domain.com","http://your-domain.com"]

# 如果使用IP访问（必须添加IP）
CORS_ORIGINS=["http://your-server-ip","https://your-server-ip"]

# 或者临时允许所有来源（仅用于测试）
CORS_ORIGINS=["*"]
```

**重要**：
- 如果使用 IP 访问，必须将 IP 添加到 `CORS_ORIGINS`
- 格式必须包含协议（`http://` 或 `https://`）
- 不要有空格

### 4. 重启服务

1. **重启 Python 项目**：
   - 在宝塔面板中：**Python项目管理器** → 找到项目 → 点击 **重启**

2. **重启 Nginx**：
   - 在宝塔面板中：**网站** → **设置** → **重载配置**

### 5. 测试 API 连接

在浏览器中访问：
```
http://your-domain.com/api/health
或
http://your-ip/api/health
```

**应该返回**：
```json
{"status":"healthy"}
```

**如果返回 404**：
- 说明 Nginx 代理配置有问题
- 检查 `location /api` 是否正确配置
- 检查后端服务是否运行（Python项目管理器中查看）

**如果无法访问**：
- 检查防火墙是否开放 80 端口
- 检查 Nginx 是否正常运行

### 6. 检查后端服务

在宝塔面板中：

1. 打开 **Python项目管理器**
2. 找到 `attendance-backend` 项目
3. 确保状态为 **运行中**
4. 如果未运行，点击 **启动**
5. 点击 **日志** 查看是否有错误

### 7. 查看错误日志

**Nginx 错误日志**：
```
/www/wwwlogs/attendance-error.log
```

**Python 项目日志**：
- 在 Python 项目管理器中点击项目的 **日志** 按钮

## 常见问题

### Q1: 直接访问 `http://ip:8000` 可以打开，但通过域名访问不行

**原因**：直接访问后端端口绕过了 Nginx，前端会尝试请求 `/api/...`，但后端可能没有正确配置 CORS。

**解决**：
1. 不要直接访问 8000 端口
2. 通过域名或 IP（80端口）访问
3. 确保 Nginx 配置正确

### Q2: 测试 `/api/health` 返回 404

**原因**：Nginx 代理配置有问题。

**解决**：
1. 检查 `location /api` 是否在 `location /` 之前
2. 检查 `proxy_pass` 是否为 `http://127.0.0.1:8000`
3. 确保后端服务正在运行（端口 8000）

### Q3: 测试 `/api/health` 返回 502 Bad Gateway

**原因**：后端服务未运行或无法连接。

**解决**：
1. 在 Python 项目管理器中检查项目状态
2. 如果未运行，点击 **启动**
3. 查看项目日志，检查是否有启动错误

### Q4: CORS 错误仍然存在

**解决**：
1. 确保 `.env` 文件中的 `CORS_ORIGINS` 包含实际访问地址
2. 如果使用 IP，必须添加 IP 地址
3. 修改后**必须重启 Python 项目**
4. 清除浏览器缓存

## 验证清单

完成修复后，请验证：

- [ ] 通过域名或 IP（80端口）访问前端，页面正常显示
- [ ] 访问 `http://your-domain.com/api/health` 返回 `{"status":"healthy"}`
- [ ] 浏览器控制台没有 CORS 错误
- [ ] 可以正常登录

如果以上都正常，说明问题已解决！

## 仍然无法解决？

请检查：
1. 防火墙是否开放 80 和 443 端口
2. 域名 DNS 解析是否正确
3. 服务器是否正常运行
4. 查看详细的错误日志

