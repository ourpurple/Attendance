"""
安全功能测试
"""
import pytest
from backend.security import (
    validate_password_strength,
    get_password_hash,
    verify_password
)


class TestPasswordSecurity:
    """密码安全测试"""
    
    def test_password_strength_validation_success(self):
        """测试密码强度验证 - 成功案例"""
        valid_passwords = [
            "Abcd1234",
            "Test@123",
            "MyP@ssw0rd",
            "Secure123Pass"
        ]
        
        for password in valid_passwords:
            is_valid, message = validate_password_strength(password)
            assert is_valid, f"密码 '{password}' 应该是有效的，但得到错误: {message}"
            assert message == ""
    
    def test_password_strength_validation_too_short(self):
        """测试密码强度验证 - 太短"""
        is_valid, message = validate_password_strength("Abc123")
        assert not is_valid
        assert "至少8个字符" in message
    
    def test_password_strength_validation_no_uppercase(self):
        """测试密码强度验证 - 缺少大写字母"""
        is_valid, message = validate_password_strength("abcd1234")
        assert not is_valid
        assert "大写字母" in message
    
    def test_password_strength_validation_no_lowercase(self):
        """测试密码强度验证 - 缺少小写字母"""
        is_valid, message = validate_password_strength("ABCD1234")
        assert not is_valid
        assert "小写字母" in message
    
    def test_password_strength_validation_no_digit(self):
        """测试密码强度验证 - 缺少数字"""
        is_valid, message = validate_password_strength("AbcdEfgh")
        assert not is_valid
        assert "数字" in message
    
    def test_password_hash_and_verify(self):
        """测试密码哈希和验证"""
        password = "TestPass123"
        hashed = get_password_hash(password)
        
        # 验证正确密码
        assert verify_password(password, hashed)
        
        # 验证错误密码
        assert not verify_password("WrongPass123", hashed)
    
    def test_password_hash_long_password(self):
        """测试超长密码哈希（超过72字节）"""
        # 创建一个超过72字节的密码
        long_password = "A" * 100 + "b1"
        hashed = get_password_hash(long_password)
        
        # 应该能够验证
        assert verify_password(long_password, hashed)
    
    def test_password_hash_unicode(self):
        """测试包含Unicode字符的密码"""
        password = "Test密码123"
        hashed = get_password_hash(password)
        
        # 应该能够验证
        assert verify_password(password, hashed)
