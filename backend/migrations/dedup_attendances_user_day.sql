-- 清理历史重复考勤记录（同一用户同一天）
-- 规则：保留最早签到 + 最晚签退，最终只保留每组一条记录

BEGIN TRANSACTION;

DROP TABLE IF EXISTS _attendance_dedup_merge;
CREATE TEMP TABLE _attendance_dedup_merge AS
WITH grouped AS (
    SELECT
        user_id,
        date(date) AS day,
        MIN(checkin_time) AS min_checkin_time,
        MAX(checkout_time) AS max_checkout_time,
        COUNT(*) AS row_count
    FROM attendances
    GROUP BY user_id, day
    HAVING COUNT(*) > 1
),
base AS (
    SELECT
        a.id,
        a.user_id,
        date(a.date) AS day,
        a.date,
        a.checkin_time,
        a.checkout_time,
        a.checkin_location,
        a.checkin_latitude,
        a.checkin_longitude,
        a.checkout_location,
        a.checkout_latitude,
        a.checkout_longitude,
        a.is_late,
        a.is_early_leave,
        a.work_hours,
        a.checkin_status,
        a.morning_status,
        a.afternoon_status,
        a.morning_leave,
        a.afternoon_leave,
        a.created_at,
        ROW_NUMBER() OVER (
            PARTITION BY a.user_id, date(a.date)
            ORDER BY a.id ASC
        ) AS rn
    FROM attendances a
    INNER JOIN grouped g
        ON g.user_id = a.user_id
       AND g.day = date(a.date)
),
checkin_choice AS (
    SELECT
        a.user_id,
        date(a.date) AS day,
        a.checkin_location,
        a.checkin_latitude,
        a.checkin_longitude,
        a.is_late,
        a.checkin_status,
        a.morning_status,
        a.morning_leave,
        ROW_NUMBER() OVER (
            PARTITION BY a.user_id, date(a.date)
            ORDER BY a.checkin_time ASC, a.id ASC
        ) AS rn
    FROM attendances a
    INNER JOIN grouped g
        ON g.user_id = a.user_id
       AND g.day = date(a.date)
    WHERE a.checkin_time IS NOT NULL
),
checkout_choice AS (
    SELECT
        a.user_id,
        date(a.date) AS day,
        a.checkout_location,
        a.checkout_latitude,
        a.checkout_longitude,
        a.is_early_leave,
        a.afternoon_status,
        a.afternoon_leave,
        a.work_hours,
        ROW_NUMBER() OVER (
            PARTITION BY a.user_id, date(a.date)
            ORDER BY a.checkout_time DESC, a.id ASC
        ) AS rn
    FROM attendances a
    INNER JOIN grouped g
        ON g.user_id = a.user_id
       AND g.day = date(a.date)
    WHERE a.checkout_time IS NOT NULL
)
SELECT
    b.id AS keep_id,
    b.user_id,
    b.day,
    b.date,
    g.min_checkin_time AS merged_checkin_time,
    g.max_checkout_time AS merged_checkout_time,
    COALESCE(cc.checkin_location, b.checkin_location) AS merged_checkin_location,
    COALESCE(cc.checkin_latitude, b.checkin_latitude) AS merged_checkin_latitude,
    COALESCE(cc.checkin_longitude, b.checkin_longitude) AS merged_checkin_longitude,
    COALESCE(co.checkout_location, b.checkout_location) AS merged_checkout_location,
    COALESCE(co.checkout_latitude, b.checkout_latitude) AS merged_checkout_latitude,
    COALESCE(co.checkout_longitude, b.checkout_longitude) AS merged_checkout_longitude,
    COALESCE(cc.is_late, b.is_late, 0) AS merged_is_late,
    COALESCE(co.is_early_leave, b.is_early_leave, 0) AS merged_is_early_leave,
    CASE
        WHEN g.min_checkin_time IS NOT NULL AND g.max_checkout_time IS NOT NULL THEN
            ROUND((julianday(g.max_checkout_time) - julianday(g.min_checkin_time)) * 24.0, 2)
        ELSE COALESCE(co.work_hours, b.work_hours)
    END AS merged_work_hours,
    COALESCE(cc.checkin_status, b.checkin_status) AS merged_checkin_status,
    COALESCE(cc.morning_status, b.morning_status) AS merged_morning_status,
    COALESCE(co.afternoon_status, b.afternoon_status) AS merged_afternoon_status,
    COALESCE(cc.morning_leave, b.morning_leave, 0) AS merged_morning_leave,
    COALESCE(co.afternoon_leave, b.afternoon_leave, 0) AS merged_afternoon_leave,
    g.row_count
FROM base b
INNER JOIN grouped g
    ON g.user_id = b.user_id
   AND g.day = b.day
LEFT JOIN checkin_choice cc
    ON cc.user_id = b.user_id
   AND cc.day = b.day
   AND cc.rn = 1
LEFT JOIN checkout_choice co
    ON co.user_id = b.user_id
   AND co.day = b.day
   AND co.rn = 1
WHERE b.rn = 1;

UPDATE attendances
SET
    checkin_time = (
        SELECT merged_checkin_time
        FROM _attendance_dedup_merge m
        WHERE m.keep_id = attendances.id
    ),
    checkout_time = (
        SELECT merged_checkout_time
        FROM _attendance_dedup_merge m
        WHERE m.keep_id = attendances.id
    ),
    checkin_location = (
        SELECT merged_checkin_location
        FROM _attendance_dedup_merge m
        WHERE m.keep_id = attendances.id
    ),
    checkin_latitude = (
        SELECT merged_checkin_latitude
        FROM _attendance_dedup_merge m
        WHERE m.keep_id = attendances.id
    ),
    checkin_longitude = (
        SELECT merged_checkin_longitude
        FROM _attendance_dedup_merge m
        WHERE m.keep_id = attendances.id
    ),
    checkout_location = (
        SELECT merged_checkout_location
        FROM _attendance_dedup_merge m
        WHERE m.keep_id = attendances.id
    ),
    checkout_latitude = (
        SELECT merged_checkout_latitude
        FROM _attendance_dedup_merge m
        WHERE m.keep_id = attendances.id
    ),
    checkout_longitude = (
        SELECT merged_checkout_longitude
        FROM _attendance_dedup_merge m
        WHERE m.keep_id = attendances.id
    ),
    is_late = (
        SELECT merged_is_late
        FROM _attendance_dedup_merge m
        WHERE m.keep_id = attendances.id
    ),
    is_early_leave = (
        SELECT merged_is_early_leave
        FROM _attendance_dedup_merge m
        WHERE m.keep_id = attendances.id
    ),
    work_hours = (
        SELECT merged_work_hours
        FROM _attendance_dedup_merge m
        WHERE m.keep_id = attendances.id
    ),
    checkin_status = (
        SELECT merged_checkin_status
        FROM _attendance_dedup_merge m
        WHERE m.keep_id = attendances.id
    ),
    morning_status = (
        SELECT merged_morning_status
        FROM _attendance_dedup_merge m
        WHERE m.keep_id = attendances.id
    ),
    afternoon_status = (
        SELECT merged_afternoon_status
        FROM _attendance_dedup_merge m
        WHERE m.keep_id = attendances.id
    ),
    morning_leave = (
        SELECT merged_morning_leave
        FROM _attendance_dedup_merge m
        WHERE m.keep_id = attendances.id
    ),
    afternoon_leave = (
        SELECT merged_afternoon_leave
        FROM _attendance_dedup_merge m
        WHERE m.keep_id = attendances.id
    )
WHERE id IN (SELECT keep_id FROM _attendance_dedup_merge);

DELETE FROM attendances
WHERE id IN (
    SELECT a.id
    FROM attendances a
    INNER JOIN _attendance_dedup_merge m
        ON m.user_id = a.user_id
       AND m.day = date(a.date)
    WHERE a.id <> m.keep_id
);

DROP TABLE IF EXISTS _attendance_dedup_merge;

COMMIT;
