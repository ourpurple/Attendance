"""
数据库迁移脚本 - 添加加班天数字段
用于将现有数据库迁移到新版本（添加 overtime_applications.days 字段）
"""
import sys
import os

# 添加项目根目录到 Python 路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from backend.database import SessionLocal, engine
from backend.models import Base, OvertimeApplication
from sqlalchemy import text


def migrate_database():
    """迁移数据库：添加 days 字段并计算现有记录的天数"""
    db = SessionLocal()
    
    try:
        print("开始数据库迁移...")
        
        # 检查字段是否已存在
        with engine.connect() as conn:
            result = conn.execute(text("PRAGMA table_info(overtime_applications)"))
            columns = [row[1] for row in result]
            
            if 'days' in columns:
                print("✓ days 字段已存在，无需迁移")
                return
        
        # 添加 days 字段
        print("1. 添加 days 字段...")
        with engine.connect() as conn:
            conn.execute(text("ALTER TABLE overtime_applications ADD COLUMN days REAL DEFAULT 0.5"))
            conn.commit()
        print("✓ days 字段添加成功")
        
        # 更新现有记录的天数（基于小时数，8小时=1天）
        print("2. 更新现有记录的天数...")
        overtimes = db.query(OvertimeApplication).all()
        for overtime in overtimes:
            # 简单计算：hours / 8，并四舍五入到最近的0.5
            calculated_days = round(overtime.hours / 8 * 2) / 2
            # 确保至少是0.5天
            overtime.days = max(0.5, calculated_days)
        
        db.commit()
        print(f"✓ 更新了 {len(overtimes)} 条加班记录")
        
        print("\n迁移完成！")
        
    except Exception as e:
        print(f"迁移失败: {e}")
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    migrate_database()


