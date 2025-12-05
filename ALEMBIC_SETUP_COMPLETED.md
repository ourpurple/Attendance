# Alembic数据库迁移系统设置完成

## 完成时间
2024年12月5日

## 完成内容

### 1. Alembic安装和初始化 ✅

#### 安装
```bash
pip install alembic
```

#### 初始化
```bash
alembic init alembic
```

创建的文件结构：
```
alembic/
├── versions/           # 迁移版本目录
│   └── 54b3e2f554e6_initial_schema.py
├── env.py             # 环境配置
├── README             # 说明文档
└── script.py.mako     # 迁移脚本模板

alembic.ini            # Alembic配置文件
```

### 2. 配置修改 ✅

#### alembic.ini
- 配置脚本位置
- 配置日志格式
- 移除硬编码的数据库URL（从config.py动态读取）

#### alembic/env.py
关键修改：
```python
# 添加项目路径
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# 导入配置和模型
from backend.config import settings
from backend.database import Base
from backend import models

# 动态设置数据库URL
config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)

# 使用项目的Base.metadata
target_metadata = Base.metadata
```

### 3. 初始迁移生成 ✅

```bash
alembic revision --autogenerate -m "initial schema"
```

生成的迁移文件：
- `alembic/versions/54b3e2f554e6_initial_schema.py`

### 4. 标记当前状态 ✅

由于数据库已经存在并包含数据，使用stamp命令标记当前状态：

```bash
alembic stamp head
```

这会在数据库中创建 `alembic_version` 表，记录当前迁移版本。

### 5. 文档编写 ✅

创建了详细的Alembic使用文档：
- `docs/alembic_setup.md` - 完整的设置和使用指南

## 使用方法

### 创建新迁移

当修改模型后，创建迁移脚本：

```bash
# 自动生成迁移（推荐）
alembic revision --autogenerate -m "添加新字段"

# 手动创建迁移
alembic revision -m "自定义迁移"
```

### 执行迁移

```bash
# 升级到最新版本
alembic upgrade head

# 升级一个版本
alembic upgrade +1

# 升级到指定版本
alembic upgrade <revision_id>
```

### 回滚迁移

```bash
# 回滚一个版本
alembic downgrade -1

# 回滚到指定版本
alembic downgrade <revision_id>

# 回滚所有
alembic downgrade base
```

### 查看状态

```bash
# 查看当前版本
alembic current

# 查看迁移历史
alembic history

# 查看详细历史
alembic history --verbose
```

## 与现有迁移的关系

### 现有SQL迁移脚本

保留在 `backend/migrations/` 目录：
- `add_version_columns.sql` - 添加version字段
- 其他历史迁移脚本...

这些脚本：
- ✅ 保留作为历史记录
- ✅ 不需要转换为Alembic格式
- ✅ 当前数据库状态已包含这些变更

### 迁移策略

从现在开始：
1. ✅ 所有新的数据库变更使用Alembic管理
2. ✅ 现有SQL脚本保留作为参考
3. ✅ 数据库已标记为最新状态

## 优势

### 1. 版本控制
- 每个数据库变更都有版本号
- 可以追踪所有变更历史
- 支持升级和回滚

### 2. 自动生成
- 基于模型变更自动生成迁移脚本
- 减少手动编写SQL的错误
- 提高开发效率

### 3. 团队协作
- 迁移脚本可以提交到Git
- 团队成员可以同步数据库变更
- 避免数据库schema不一致

### 4. 生产部署
- 可以在部署时自动执行迁移
- 支持回滚到之前的版本
- 降低部署风险

## 注意事项

### 1. 循环依赖警告

可能会看到关于 `departments` 和 `users` 表的循环依赖警告：

```
SAWarning: Cannot correctly sort tables; there are unresolvable cycles
```

这是正常的，因为：
- `users.department_id` → `departments.id`
- `departments.head_id` → `users.id`

不影响功能，可以忽略。

### 2. SQLite限制

SQLite不支持某些ALTER操作：
- 不能直接修改列类型
- 不能删除列（需要重建表）
- 某些约束变更需要特殊处理

Alembic会自动处理这些限制。

### 3. 检查生成的迁移

自动生成的迁移可能不完美：
- 总是检查生成的 `upgrade()` 和 `downgrade()` 函数
- 确保迁移逻辑正确
- 必要时手动调整

### 4. 测试迁移

在生产环境执行前：
- 在开发环境测试升级
- 测试回滚功能
- 确保数据完整性

## 工作流程

### 开发流程

1. **修改模型**
   ```python
   # backend/models.py
   class User(Base):
       # 添加新字段
       new_field = Column(String(100))
   ```

2. **生成迁移**
   ```bash
   alembic revision --autogenerate -m "add new_field to users"
   ```

3. **检查迁移脚本**
   ```bash
   # 查看生成的文件
   cat alembic/versions/xxx_add_new_field_to_users.py
   ```

4. **执行迁移**
   ```bash
   alembic upgrade head
   ```

5. **测试**
   ```bash
   # 测试应用功能
   python run.py
   ```

6. **提交代码**
   ```bash
   git add backend/models.py alembic/versions/xxx_*.py
   git commit -m "Add new_field to users table"
   ```

### 部署流程

1. **拉取代码**
   ```bash
   git pull origin main
   ```

2. **备份数据库**
   ```bash
   cp attendance.db attendance.db.backup
   ```

3. **执行迁移**
   ```bash
   alembic upgrade head
   ```

4. **验证**
   ```bash
   alembic current
   python run.py
   ```

5. **如果失败，回滚**
   ```bash
   alembic downgrade -1
   cp attendance.db.backup attendance.db
   ```

## 示例迁移

### 添加字段

```python
"""add avatar field to users

Revision ID: abc123
"""

def upgrade():
    op.add_column('users', 
        sa.Column('avatar', sa.String(255), nullable=True)
    )

def downgrade():
    op.drop_column('users', 'avatar')
```

### 添加索引

```python
"""add index on users email

Revision ID: def456
"""

def upgrade():
    op.create_index('idx_users_email', 'users', ['email'])

def downgrade():
    op.drop_index('idx_users_email', 'users')
```

### 数据迁移

```python
"""migrate user status

Revision ID: ghi789
"""

def upgrade():
    # 添加新字段
    op.add_column('users', sa.Column('status', sa.String(20)))
    
    # 迁移数据
    op.execute("UPDATE users SET status = 'active' WHERE is_active = 1")
    op.execute("UPDATE users SET status = 'inactive' WHERE is_active = 0")
    
    # 删除旧字段（可选）
    # op.drop_column('users', 'is_active')

def downgrade():
    # 恢复旧字段
    # op.add_column('users', sa.Column('is_active', sa.Boolean()))
    
    # 迁移数据回去
    op.execute("UPDATE users SET is_active = 1 WHERE status = 'active'")
    op.execute("UPDATE users SET is_active = 0 WHERE status != 'active'")
    
    # 删除新字段
    op.drop_column('users', 'status')
```

## 故障排除

### 问题1：迁移失败

```bash
# 查看当前状态
alembic current

# 查看将要执行的SQL（不实际执行）
alembic upgrade head --sql

# 手动修复后，标记为已迁移
alembic stamp head
```

### 问题2：版本冲突

```bash
# 查看所有分支
alembic branches

# 合并分支
alembic merge <rev1> <rev2> -m "merge branches"
```

### 问题3：需要重置

```bash
# 删除版本表
sqlite3 attendance.db "DROP TABLE IF EXISTS alembic_version"

# 重新标记
alembic stamp head
```

## 下一步

- ✅ Alembic已配置完成
- ✅ 可以开始使用Alembic管理数据库变更
- ⏳ 继续其他优化任务（Redis缓存、前端重构等）

## 相关文档

- [Alembic设置指南](./docs/alembic_setup.md)
- [数据库迁移记录](./DATABASE_MIGRATION_DEC5.md)
- [TODO清单](./TODO.md)

## 总结

Alembic数据库迁移系统已成功设置并配置完成。从现在开始，所有数据库schema变更都应该通过Alembic管理，确保版本控制和团队协作的一致性。

---

**设置完成时间**: 2025年12月5日  
**当前迁移版本**: 54b3e2f554e6 (initial schema)  
**状态**: ✅ 已完成并可用
