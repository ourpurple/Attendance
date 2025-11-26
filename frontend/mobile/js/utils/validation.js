/**
 * 表单验证工具模块
 */

/**
 * 验证密码
 */
export function validatePassword(password, minLength = 6) {
    if (!password) {
        return { valid: false, message: '密码不能为空' };
    }
    if (password.length < minLength) {
        return { valid: false, message: `密码长度至少为${minLength}位` };
    }
    return { valid: true };
}

/**
 * 验证两次密码是否一致
 */
export function validatePasswordMatch(password, confirmPassword) {
    if (password !== confirmPassword) {
        return { valid: false, message: '两次输入的密码不一致' };
    }
    return { valid: true };
}

/**
 * 验证密码不能与原密码相同
 */
export function validatePasswordNotSame(oldPassword, newPassword) {
    if (oldPassword === newPassword) {
        return { valid: false, message: '新密码不能与原密码相同' };
    }
    return { valid: true };
}

/**
 * 验证日期范围
 */
export function validateDateRange(startDate, endDate) {
    if (!startDate || !endDate) {
        return { valid: false, message: '请选择开始和结束日期' };
    }
    if (new Date(endDate) < new Date(startDate)) {
        return { valid: false, message: '结束日期不能早于开始日期' };
    }
    return { valid: true };
}

/**
 * 验证时间范围
 */
export function validateTimeRange(startTime, endTime) {
    if (!startTime || !endTime) {
        return { valid: false, message: '请选择开始和结束时间' };
    }
    if (endTime < startTime) {
        return { valid: false, message: '结束时间不能早于开始时间' };
    }
    return { valid: true };
}

/**
 * 验证必填字段
 */
export function validateRequired(value, fieldName) {
    if (!value || (typeof value === 'string' && !value.trim())) {
        return { valid: false, message: `${fieldName}不能为空` };
    }
    return { valid: true };
}

