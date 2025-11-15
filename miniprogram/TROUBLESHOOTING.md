# 小程序错误排查指南

## "object null is not iterable" 错误排查

如果仍然遇到此错误，请按以下步骤排查：

### 1. 查看详细错误信息
在微信开发者工具的"调试器" -> "Console" 标签中，查看完整的错误堆栈信息，找到具体是哪个文件、哪一行代码出错。

### 2. 检查网络请求
在"调试器" -> "Network" 标签中，检查 API 请求的响应数据：
- 响应状态码是否为 200
- 响应数据是否为 null
- 响应数据格式是否正确（应该是数组或对象）

### 3. 添加调试日志
在可能出错的地方添加 `console.log`：

```javascript
// 在 loadXXX 函数中添加
console.log('API 响应数据:', data);
console.log('数据类型:', typeof data);
console.log('是否为数组:', Array.isArray(data));
```

### 4. 检查页面初始化
确保所有页面的 `data` 中数组都已初始化：
- `leaveList: []`
- `overtimeList: []`
- `attendanceList: []`
- `recentAttendance: []`

### 5. 常见问题
1. **后端返回 null**：检查后端 API 是否正确返回数据
2. **网络错误**：检查网络连接和 API 地址配置
3. **数据格式错误**：检查后端返回的数据格式是否符合预期

### 6. 临时解决方案
如果问题仍然存在，可以在 `app.js` 的 `request` 方法中添加更详细的日志：

```javascript
success: (res) => {
  console.log('✅ 响应:', res.statusCode, res.data);
  console.log('响应数据类型:', typeof res.data);
  console.log('是否为数组:', Array.isArray(res.data));
  // ... 其他代码
}
```

然后查看控制台输出，找到具体是哪个请求返回了 null。

