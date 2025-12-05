# Alembic 数据库迁移设置指南

## 概述

Alembic是SQLAlchemy的数据库迁移工具，用于管理数据库schema的版本控制。

## 安装和配置

### 1. 安装Alembic

```bash
pip install alembic
```

### 2. 初始化Alembic

已完成初始化，创建了以下文件：
- `alembic.ini` - Alembic配置文件
- `alembic/` - 迁移脚本目录
- `alembic/env.py` - 迁移环境配置
- `alembic/versions/` - 迁移版本目录

### 3. 配置说明

#### alembic/env.py

已配置为：
- 自动从 `backend.config` 读取数据库URL
- 使用 `backend.database.Base.metadata` 作为目标元数据
- 自动导入所有模型

```python
from backend.config import settings
from backend.database import Base
from backend import models

config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)
target_metadata = Base.metadata
```

## 使用方法

### 创建迁移脚本

#### 自动生成迁移（推荐）

```bash
# 基于模型变更自动生成迁移脚本
alembic revision --autogenerate -m "描述变更内容"
```

#### 手动创建迁移

```bash
# 创建空白迁移脚本
alembic revision -m "描述变更内容"
```

### 执行迁移

```bash
# 升级到最新版本
alembic upgrade head

# 升级到指定版本
alembic upgrade <revision_id>

# 升级一个版本
alembic upgrade +1
```

### 回滚迁移

```bash
# 回滚到上一个版本
alembic downgrade -1

# 回滚到指定版本
alembic downgrade <revision_id>

# 回滚所有迁移
alembic downgrade base
```

### 查看迁移历史

```bash
# 查看当前版本
alembic current

# 查看迁移历史
alembic history

# 查看详细历史
alembic history --verbose
```

## 注意事项

### 1. 现有数据库

对于已有数据的数据库，首次使用Alembic时：

1. **标记当前状态**（推荐）
   ```bash
   # 生成初始迁移但不执行
   alembic revision --autogenerate -m "initial schema"
   
   # 标记数据库为已迁移状态（不实际执行SQL）
   alembic stamp head
   ```

2. **或者清空数据库重新开始**
   ```bash
   # 删除数据库
   rm attendance.db
   
   # 执行迁移
   alembic upgrade head
   ```

### 2. 循环依赖警告

如果看到关于 `departments` 和 `users` 表的循环依赖警告：

```
SAWarning: Cannot correctly sort tables; there are unresolvable cycles between tables "departments, users"
```

这是正常的，因为：
- `users` 表有外键指向 `departments.id`
- `departments` 表有外键指向 `users.id` (head_id)

解决方法：
- 在模型中使用 `use_alter=True` 标记其中一个外键
- 或者在迁移脚本中手动调整创建顺序

### 3. 自动生成的限制

Alembic的自动生成功能有一些限制：
- 不能检测表名或列名的重命名（会被识别为删除+创建）
- 不能检测某些约束的变更
- 需要手动检查和调整生成的迁移脚本

### 4. 最佳实践

1. **总是检查生成的迁移脚本**
   - 自动生成后，检查 `upgrade()` 和 `downgrade()` 函数
   - 确保迁移逻辑正确

2. **测试迁移**
   ```bash
   # 测试升级
   alembic upgrade head
   
   # 测试回滚
   alembic downgrade -1
   
   # 再次升级
   alembic upgrade head
   ```

3. **版本控制**
   - 将迁移脚本提交到Git
   - 不要修改已经部署的迁移脚本

4. **生产环境**
   - 在部署前备份数据库
   - 在测试环境先执行迁移
   - 准备回滚计划

## 常见迁移场景

### 添加新字段

```python
def upgrade():
    op.add_column('users', sa.Column('new_field', sa.String(100), nullable=True))

def downgrade():
    op.drop_column('users', 'new_field')
```

### 修改字段类型

```python
def upgrade():
    # SQLite不支持ALTER COLUMN，需要重建表
    op.alter_column('users', 'age', type_=sa.Integer())

def downgrade():
    op.alter_column('users', 'age', type_=sa.String())
```

### 添加索引

```python
def upgrade():
    op.create_index('idx_users_email', 'users', ['email'])

def downgrade():
    op.drop_index('idx_users_email', 'users')
```

### 数据迁移

```python
from alembic import op
import sqlalchemy as sa
from sqlalchemy.sql import table, column

def upgrade():
    # 添加新字段
    op.add_column('users', sa.Column('full_name', sa.String(200)))
    
    # 数据迁移
    users_table = table('users',
        column('id', sa.Integer),
        column('first_name', sa.String),
        column('last_name', sa.String),
        column('full_name', sa.String)
    )
    
    conn = op.get_bind()
    users = conn.execute(users_table.select()).fetchall()
    
    for user in users:
        conn.execute(
            users_table.update()
            .where(users_table.c.id == user.id)
            .values(full_name=f"{user.first_name} {user.last_name}")
        )
```

## 与现有迁移脚本的关系

### backend/migrations/*.sql

现有的SQL迁移脚本：
- `add_version_columns.sql` - 添加version字段
- 其他迁移脚本...

这些脚本可以：
1. **保留作为参考** - 记录历史变更
2. **转换为Alembic格式** - 创建对应的Alembic迁移
3. **标记为已执行** - 使用 `alembic stamp` 标记

### 迁移策略

推荐策略：
1. 保留现有SQL脚本作为历史记录
2. 从当前状态开始使用Alembic
3. 使用 `alembic stamp head` 标记当前状态
4. 未来的变更都使用Alembic管理

## 故障排除

### 问题：迁移失败

```bash
# 查看当前状态
alembic current

# 查看SQL（不执行）
alembic upgrade head --sql

# 手动修复数据库后，标记为已迁移
alembic stamp head
```

### 问题：迁移冲突

```bash
# 查看分支
alembic branches

# 合并分支
alembic merge <rev1> <rev2> -m "merge branches"
```

### 问题：需要重置

```bash
# 删除alembic_version表
sqlite3 attendance.db "DROP TABLE IF EXISTS alembic_version"

# 重新标记
alembic stamp head
```

## 参考资料

- [Alembic官方文档](https://alembic.sqlalchemy.org/)
- [SQLAlchemy文档](https://docs.sqlalchemy.org/)
- [迁移最佳实践](https://alembic.sqlalchemy.org/en/latest/cookbook.html)
