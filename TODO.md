# 考勤系统改进 TODO List

## 🔴 第一阶段：安全加固与紧急修复（Week 1-2）

### Week 1: 安全修复

#### 密码安全增强 (2天)
- [x] 修复 `backend/security.py:21` 密码截断问题
- [x] 添加密码强度验证函数（最小8位，包含大小写字母、数字）
- [x] 实施密码加盐存储验证
- [x] 添加密码修改日志记录到数据库
- [x] 编写密码安全单元测试

#### API安全加固 (2天)
- [x] 实现请求频率限制（使用自定义中间件，无需slowapi）
- [x] 创建 `backend/middleware/rate_limit.py` 中间件
- [x] 在 `main.py` 中注册频率限制中间件
- [ ] 更新 `config.py` 添加CORS白名单配置
- [x] 添加请求体大小限制（max 10MB）
- [ ] 编写API安全测试用例

#### 错误处理完善 (1天)
- [ ] 创建 `backend/exceptions/handlers.py` 全局异常处理器
- [ ] 实施错误信息脱敏（隐藏堆栈跟踪）
- [ ] 统一错误响应格式 `{code, message, detail}`
- [ ] 在 `main.py` 中注册异常处理器
- [ ] 添加错误日志记录

### Week 2: 关键Bug修复

#### 时区处理统一 (3天)
- [x] 创建 `backend/utils/timezone.py` 时区工具类
- [x] 实现 `to_utc()` 和 `to_local()` 转换函数
- [ ] 修改所有数据库存储为UTC时间
- [ ] 创建 `frontend/mobile/utils/datetime.js` 前端时区工具
- [ ] 重构 `app.js` 中所有时间处理逻辑
- [x] 添加时区处理单元测试（至少10个用例）
- [ ] 更新API文档说明时区处理规则

#### 并发控制 (2天)
- [x] 在 `models.py` 关键表添加 `version` 字段
- [x] 创建 `backend/utils/optimistic_lock.py` 乐观锁装饰器
- [x] 在更新操作中实施版本检查
- [x] 处理并发冲突异常（返回409状态码）
- [x] 编写并发测试用例（使用threading模拟）

---

## 🟠 第二阶段：性能优化与代码重构（Week 3-6）

### Week 3: 数据库优化

#### 引入Alembic (2天)
- [ ] 安装 `alembic` 库
- [ ] 运行 `alembic init migrations` 初始化
- [ ] 配置 `alembic.ini` 和 `env.py`
- [ ] 生成初始迁移脚本 `alembic revision --autogenerate -m "initial"`
- [ ] 迁移 `backend/migrations/*.sql` 到Alembic格式
- [ ] 编写数据库迁移文档 `docs/database_migration.md`
- [ ] 测试迁移回滚功能

#### 查询优化 (3天)
- [ ] 启用SQLAlchemy查询日志分析慢查询
- [ ] 在 `models.py` 添加索引：
  - [ ] `attendances` 表：`(user_id, date)` 复合索引
  - [ ] `leave_applications` 表：`(user_id, status)` 复合索引
  - [ ] `overtime_applications` 表：`(user_id, status)` 复合索引
- [ ] 优化 `attendance.py:1088` 使用 `joinedload` 预加载
- [ ] 优化 `leave.py` 的待审批查询
- [ ] 优化 `statistics.py` 的统计查询
- [ ] 添加查询性能测试（对比优化前后）
- [ ] 生成查询优化报告

### Week 4: 缓存系统升级

#### Redis集成 (2天)
- [ ] 安装 `redis` 和 `aioredis` 库
- [ ] 创建 `backend/cache/redis_client.py` Redis连接管理器
- [ ] 在 `config.py` 添加Redis配置
- [ ] 创建 `backend/cache/decorators.py` 缓存装饰器
- [ ] 配置缓存过期策略（默认1小时）
- [ ] 编写Redis连接测试

#### 缓存应用 (2天)
- [ ] 迁移 `geocode_cache.py` 到Redis
- [ ] 缓存用户信息（key: `user:{id}`）
- [ ] 缓存部门信息（key: `dept:{id}`）
- [ ] 缓存节假日配置（key: `holiday:{date}`）
- [ ] 实施缓存预热（启动时加载常用数据）
- [ ] 添加缓存命中率监控

#### 异步任务队列 (1天)
- [ ] 安装 `celery` 和 `redis` 作为broker
- [ ] 创建 `backend/tasks/celery_app.py` Celery配置
- [ ] 创建 `backend/tasks/wechat_tasks.py` 微信消息任务
- [ ] 修改 `wechat_message.py` 使用异步发送
- [ ] 配置Celery worker启动脚本
- [ ] 测试异步任务执行

### Week 5-6: 前端代码重构

#### 代码模块化 (4天)
- [ ] 创建 `frontend/mobile/src/` 目录结构
- [ ] 拆分 `app.js` 为模块：
  - [ ] `src/auth.js` - 登录、登出、token管理
  - [ ] `src/attendance.js` - 打卡相关功能
  - [ ] `src/leave.js` - 请假申请和列表
  - [ ] `src/overtime.js` - 加班申请和列表
  - [ ] `src/approval.js` - 审批功能
  - [ ] `src/statistics.js` - 统计功能
  - [ ] `src/api.js` - API请求封装
  - [ ] `src/utils.js` - 工具函数
  - [ ] `src/ui.js` - UI组件（toast、modal等）
- [ ] 创建 `src/main.js` 作为入口文件
- [ ] 配置Webpack或Vite打包工具
- [ ] 更新 `index.html` 引用打包后的文件
- [ ] 测试所有功能正常运行

#### 状态管理优化 (2天)
- [ ] 创建 `src/store.js` 状态管理器
- [ ] 实现状态订阅和发布机制
- [ ] 迁移全局变量到状态管理器
- [ ] 实施LocalStorage持久化
- [ ] 添加状态变更日志（开发模式）
- [ ] 测试状态同步功能

#### 性能优化 (2天)
- [ ] 创建 `src/utils/debounce.js` 防抖函数
- [ ] 创建 `src/utils/throttle.js` 节流函数
- [ ] 在搜索、滚动等场景应用防抖节流
- [ ] 实施虚拟滚动（考勤列表、申请列表）
- [ ] 优化DOM操作（使用DocumentFragment）
- [ ] 添加骨架屏加载状态
- [ ] 使用Lighthouse测试性能评分

---

## 🟡 第三阶段：架构升级与质量提升（Week 7-10）

### Week 7-8: 服务层重构

#### 创建服务层 (4天)
- [ ] 创建 `backend/services/` 目录
- [ ] 创建 `backend/services/base.py` 基础服务类
- [ ] 创建 `backend/services/attendance_service.py`
  - [ ] 迁移打卡业务逻辑
  - [ ] 实现考勤统计方法
- [ ] 创建 `backend/services/leave_service.py`
  - [ ] 迁移请假业务逻辑
  - [ ] 实现审批流程方法
- [ ] 创建 `backend/services/overtime_service.py`
  - [ ] 迁移加班业务逻辑
  - [ ] 实现加班统计方法
- [ ] 创建 `backend/services/approval_service.py`
  - [ ] 统一审批流程逻辑
  - [ ] 实现审批人分配
- [ ] 更新路由使用服务层
- [ ] 编写服务层接口文档

#### 依赖注入优化 (2天)
- [ ] 创建 `backend/dependencies.py` 依赖注入模块
- [ ] 实现服务工厂函数
- [ ] 优化数据库会话管理（使用上下文管理器）
- [ ] 在路由中使用依赖注入
- [ ] 添加依赖注入测试

#### 配置管理增强 (2天)
- [ ] 创建 `backend/config/` 目录
- [ ] 创建 `config/base.py` 基础配置
- [ ] 创建 `config/development.py` 开发环境配置
- [ ] 创建 `config/testing.py` 测试环境配置
- [ ] 创建 `config/production.py` 生产环境配置
- [ ] 实施配置验证（使用Pydantic）
- [ ] 更新 `.env.example` 文件
- [ ] 编写配置文档

### Week 9: 测试体系建设

#### 单元测试 (3天)
- [ ] 创建 `tests/` 目录结构
- [ ] 创建 `tests/conftest.py` pytest配置
- [ ] 为服务层添加测试：
  - [ ] `tests/services/test_attendance_service.py`
  - [ ] `tests/services/test_leave_service.py`
  - [ ] `tests/services/test_overtime_service.py`
- [ ] 为工具函数添加测试：
  - [ ] `tests/utils/test_timezone.py`
  - [ ] `tests/utils/test_optimistic_lock.py`
- [ ] 使用pytest fixtures管理测试数据
- [ ] 运行测试覆盖率报告（目标>80%）
- [ ] 修复测试失败用例

#### 集成测试 (2天)
- [ ] 创建 `tests/integration/` 目录
- [ ] 创建测试数据库配置
- [ ] 添加API集成测试：
  - [ ] `tests/integration/test_auth_api.py`
  - [ ] `tests/integration/test_attendance_api.py`
  - [ ] `tests/integration/test_leave_api.py`
- [ ] 使用TestClient测试路由
- [ ] 模拟外部依赖（微信API、高德地图API）
- [ ] 测试完整审批流程
- [ ] 生成集成测试报告

### Week 10: 代码质量工具

#### 代码规范工具 (2天)
- [ ] 安装 `black`、`flake8`、`mypy`
- [ ] 创建 `pyproject.toml` 配置文件
- [ ] 创建 `.flake8` 配置文件
- [ ] 运行 `black` 格式化所有代码
- [ ] 修复 `flake8` 检查出的问题
- [ ] 添加类型注解并运行 `mypy`
- [ ] 安装 `eslint`、`prettier`
- [ ] 创建 `.eslintrc.js` 和 `.prettierrc` 配置
- [ ] 格式化前端代码
- [ ] 安装 `pre-commit` 并配置hooks
- [ ] 测试pre-commit功能

#### 文档完善 (2天)
- [ ] 使用FastAPI自动生成OpenAPI文档
- [ ] 为所有API端点添加详细描述
- [ ] 添加请求/响应示例
- [ ] 创建 `docs/` 目录
- [ ] 编写 `docs/developer_guide.md` 开发者指南
- [ ] 编写 `docs/api_guide.md` API使用指南
- [ ] 为关键函数添加docstring
- [ ] 更新 `README.md`
- [ ] 生成代码文档（使用Sphinx）

#### 日志系统升级 (1天)
- [ ] 安装 `python-json-logger` 库
- [ ] 创建 `backend/logging_config.py` 日志配置
- [ ] 实施结构化日志（JSON格式）
- [ ] 配置不同环境的日志级别
- [ ] 添加日志轮转（使用RotatingFileHandler）
- [ ] 实施日志脱敏（过滤密码、token）
- [ ] 测试日志输出

---

## 🟢 第四阶段：监控运维与持续优化（Week 11-12）

### Week 11: 监控告警

#### 健康检查 (1天)
- [ ] 在 `main.py` 添加 `/health` 端点
- [ ] 实施数据库连接检查
- [ ] 实施Redis连接检查
- [ ] 添加 `/ready` 就绪探针
- [ ] 添加 `/live` 存活探针
- [ ] 测试健康检查端点

#### 监控集成 (2天)
- [ ] 安装 `prometheus-fastapi-instrumentator`
- [ ] 在 `main.py` 集成Prometheus
- [ ] 添加自定义指标（请求计数、响应时间等）
- [ ] 安装配置Grafana
- [ ] 创建Grafana仪表板
- [ ] 配置告警规则（响应时间>1s、错误率>1%）
- [ ] 测试监控数据收集

#### 日志聚合 (2天)
- [ ] 配置日志输出到文件
- [ ] 安装配置Filebeat（可选）
- [ ] 集成ELK Stack或Loki（可选）
- [ ] 创建日志查询面板
- [ ] 配置日志告警规则
- [ ] 测试日志查询功能

### Week 12: 部署优化与总结

#### Docker优化 (2天)
- [ ] 优化 `Dockerfile` 使用多阶段构建
- [ ] 减小镜像体积（使用alpine基础镜像）
- [ ] 添加 `HEALTHCHECK` 指令
- [ ] 优化 `docker-compose.yml`
- [ ] 添加Redis和Celery服务
- [ ] 配置环境变量
- [ ] 测试Docker部署

#### CI/CD建设 (2天)
- [ ] 创建 `.github/workflows/ci.yml`（或GitLab CI配置）
- [ ] 配置自动化测试流程
- [ ] 配置代码质量检查
- [ ] 配置自动化部署流程
- [ ] 配置环境隔离（dev/staging/prod）
- [ ] 测试CI/CD流程
- [ ] 编写CI/CD文档

#### 项目总结 (1天)
- [ ] 编写改进总结报告 `IMPROVEMENT_SUMMARY.md`
- [ ] 整理遗留问题清单 `BACKLOG.md`
- [ ] 制定后续优化计划
- [ ] 准备团队知识分享PPT
- [ ] 进行团队复盘会议
- [ ] 更新项目文档

---

## 📊 验收检查清单

### 安全性
- [ ] 密码强度验证通过
- [ ] API频率限制生效
- [ ] 错误信息不泄露敏感数据
- [ ] 所有输入都经过验证

### 性能
- [ ] API响应时间P95 < 200ms
- [ ] 数据库查询时间P95 < 50ms
- [ ] 页面加载时间 < 2s
- [ ] 缓存命中率 > 80%

### 质量
- [ ] 单元测试覆盖率 > 80%
- [ ] 集成测试通过率 100%
- [ ] 代码规范检查通过
- [ ] 文档完整度 > 90%

### 稳定性
- [ ] 系统可用性 > 99.9%
- [ ] 错误率 < 0.1%
- [ ] 并发测试通过（100用户）
- [ ] 压力测试通过（1000 req/s）

---

## 🎯 快速开始

### 立即可做（1-2天）
- [ ] 添加 `.gitignore` 排除敏感文件
- [ ] 创建 `.env.example` 环境变量模板
- [ ] 添加 `requirements-dev.txt` 开发依赖
- [ ] 配置 `.editorconfig` 统一编辑器配置
- [ ] 更新 `README.md` 添加快速开始指南
- [ ] 添加 `CONTRIBUTING.md` 贡献指南
- [ ] 创建 `CHANGELOG.md` 变更日志

---

## 📝 注意事项

1. ✅ 每完成一个任务，在对应的checkbox打勾
2. ✅ 遇到问题及时记录到 `ISSUES.md`
3. ✅ 重要变更必须经过代码审查
4. ✅ 数据库变更必须先备份
5. ✅ 生产环境部署必须先在测试环境验证
6. ✅ 所有代码必须有对应的测试
7. ✅ 文档必须与代码同步更新

---

## 🔗 相关文档

- [改进计划详细说明](./IMPROVEMENT_PLAN.md)
- [架构设计文档](./docs/architecture.md)
- [API文档](http://localhost:8000/docs)
- [开发者指南](./docs/developer_guide.md)