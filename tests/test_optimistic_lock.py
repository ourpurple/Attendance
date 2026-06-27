"""
乐观锁测试
"""
import pytest
from backend.utils.optimistic_lock import (
    OptimisticLockError,
    check_version,
    increment_version,
    with_optimistic_lock
)
from fastapi import HTTPException


class MockEntity:
    """模拟实体类"""
    def __init__(self, version: int = 1):
        self.version = version


class MockEntityNoVersion:
    """没有version字段的模拟实体类"""
    pass


class TestOptimisticLock:
    """乐观锁测试"""
    
    def test_check_version_success(self):
        """测试版本检查 - 成功"""
        entity = MockEntity(version=1)
        # 不应该抛出异常
        check_version(entity, 1)
    
    def test_check_version_conflict(self):
        """测试版本检查 - 冲突"""
        entity = MockEntity(version=2)
        
        with pytest.raises(OptimisticLockError) as exc_info:
            check_version(entity, 1)
        
        assert "已被其他用户修改" in str(exc_info.value)
    
    def test_check_version_no_version_field(self):
        """测试版本检查 - 实体没有version字段"""
        entity = MockEntityNoVersion()
        # 不应该抛出异常，只是警告
        check_version(entity, 1)
    
    def test_increment_version(self):
        """测试增加版本号"""
        entity = MockEntity(version=1)
        increment_version(entity)
        
        assert entity.version == 2
    
    def test_increment_version_multiple_times(self):
        """测试多次增加版本号"""
        entity = MockEntity(version=1)
        
        increment_version(entity)
        assert entity.version == 2
        
        increment_version(entity)
        assert entity.version == 3
        
        increment_version(entity)
        assert entity.version == 4
    
    def test_increment_version_no_version_field(self):
        """测试增加版本号 - 实体没有version字段"""
        entity = MockEntityNoVersion()
        # 不应该抛出异常，只是警告
        increment_version(entity)
    
    def test_with_optimistic_lock_decorator_success(self):
        """测试乐观锁装饰器 - 成功"""
        @with_optimistic_lock
        def update_entity(entity, new_value):
            entity.value = new_value
            return entity
        
        entity = MockEntity(version=1)
        entity.value = "old"
        
        result = update_entity(entity, "new")
        assert result.value == "new"
    
    def test_with_optimistic_lock_decorator_conflict(self):
        """测试乐观锁装饰器 - 冲突"""
        @with_optimistic_lock
        def update_entity(entity, expected_version):
            check_version(entity, expected_version)
            entity.value = "new"
            return entity
        
        entity = MockEntity(version=2)
        entity.value = "old"
        
        with pytest.raises(HTTPException) as exc_info:
            update_entity(entity, 1)
        
        assert exc_info.value.status_code == 409
        assert "已被其他用户修改" in exc_info.value.detail
    
    def test_complete_update_workflow(self):
        """测试完整的更新工作流"""
        @with_optimistic_lock
        def update_entity(entity, expected_version, new_value):
            # 1. 检查版本
            check_version(entity, expected_version)
            
            # 2. 更新数据
            entity.value = new_value
            
            # 3. 增加版本号
            increment_version(entity)
            
            return entity
        
        # 初始状态
        entity = MockEntity(version=1)
        entity.value = "initial"
        
        # 第一次更新
        result = update_entity(entity, 1, "updated1")
        assert result.value == "updated1"
        assert result.version == 2
        
        # 第二次更新（使用新版本号）
        result = update_entity(entity, 2, "updated2")
        assert result.value == "updated2"
        assert result.version == 3
        
        # 尝试使用旧版本号更新（应该失败）
        with pytest.raises(HTTPException) as exc_info:
            update_entity(entity, 1, "should_fail")
        
        assert exc_info.value.status_code == 409
