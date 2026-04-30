-- Запустите этот скрипт один раз в phpMyAdmin (вкладка SQL)
-- Создаёт таблицу для хранения данных приложения

CREATE TABLE IF NOT EXISTS `kv_store` (
  `key`        VARCHAR(255)  NOT NULL,
  `value`      LONGTEXT,
  `updated_at` TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
