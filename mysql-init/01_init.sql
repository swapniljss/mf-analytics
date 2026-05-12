-- MySQL initialisation script
-- Runs automatically when the container is first created

CREATE DATABASE IF NOT EXISTS `mutualfund_analytics`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `mutualfund_analytics`;

-- Increase group_concat limit for analytical queries
SET GLOBAL group_concat_max_len = 1048576;

-- Tables are created by SQLAlchemy on first backend startup (create_all).
-- This script just ensures the DB exists with the right charset.
