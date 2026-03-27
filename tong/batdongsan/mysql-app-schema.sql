CREATE DATABASE IF NOT EXISTS batdongsan
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE batdongsan;

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS roommate_comments;
DROP TABLE IF EXISTS roommate_likes;
DROP TABLE IF EXISTS roommate_posts;
DROP TABLE IF EXISTS traffic_visits;
DROP TABLE IF EXISTS site_settings;
DROP TABLE IF EXISTS search_history;
DROP TABLE IF EXISTS favorites;
DROP TABLE IF EXISTS group_messages;
DROP TABLE IF EXISTS group_members;
DROP TABLE IF EXISTS group_chats;
DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS property_videos;
DROP TABLE IF EXISTS property_images;
DROP TABLE IF EXISTS properties;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  phone VARCHAR(32) NOT NULL,
  password_hash VARCHAR(255) NOT NULL DEFAULT '',
  name VARCHAR(255) NOT NULL,
  role INT NOT NULL DEFAULT 0,
  avatar TEXT NULL,
  zalo_id VARCHAR(128) NULL,
  referred_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY users_phone_unique (phone),
  UNIQUE KEY users_zalo_id_unique (zalo_id),
  KEY users_phone_idx (phone),
  KEY users_zalo_id_idx (zalo_id),
  KEY users_referred_by_idx (referred_by),
  CONSTRAINT users_referred_by_fk
    FOREIGN KEY (referred_by) REFERENCES users(id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE properties (
  id BIGINT NOT NULL AUTO_INCREMENT,
  source_raw_id VARCHAR(64) NULL,
  source_symbol VARCHAR(64) NULL,
  source_file VARCHAR(128) NULL,
  title VARCHAR(255) NOT NULL,
  type VARCHAR(32) NOT NULL,
  category VARCHAR(64) NOT NULL,
  price DECIMAL(15,3) NOT NULL DEFAULT 0,
  price_unit VARCHAR(64) NOT NULL,
  area DECIMAL(10,2) NOT NULL DEFAULT 0,
  address TEXT NOT NULL,
  province VARCHAR(128) NOT NULL,
  district VARCHAR(128) NOT NULL,
  ward VARCHAR(128) NULL,
  bedrooms INT NULL,
  bathrooms INT NULL,
  floors INT NULL,
  description LONGTEXT NOT NULL,
  images JSON NULL,
  contact_name VARCHAR(255) NOT NULL,
  contact_phone VARCHAR(64) NOT NULL,
  contact_link TEXT NULL,
  is_featured TINYINT(1) NOT NULL DEFAULT 0,
  is_verified TINYINT(1) NOT NULL DEFAULT 0,
  posted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NULL,
  views INT NOT NULL DEFAULT 0,
  price_per_sqm DECIMAL(15,3) NULL,
  user_id INT UNSIGNED NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'approved',
  commission DECIMAL(5,2) NULL,
  source_text LONGTEXT NULL,
  source_keywords JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY properties_type_idx (type),
  KEY properties_category_idx (category),
  KEY properties_province_idx (province),
  KEY properties_district_idx (district),
  KEY properties_is_featured_idx (is_featured),
  KEY properties_expires_at_idx (expires_at),
  KEY properties_user_id_idx (user_id),
  CONSTRAINT properties_user_id_fk
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE property_images (
  id BIGINT NOT NULL AUTO_INCREMENT,
  property_id BIGINT NOT NULL,
  sort_order INT NOT NULL DEFAULT 1,
  image_url TEXT NOT NULL,
  width INT NULL,
  height INT NULL,
  captured_at DATETIME NULL,
  source_mid VARCHAR(64) NULL,
  PRIMARY KEY (id),
  KEY property_images_property_idx (property_id),
  CONSTRAINT property_images_property_fk
    FOREIGN KEY (property_id) REFERENCES properties(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE property_videos (
  id BIGINT NOT NULL AUTO_INCREMENT,
  property_id BIGINT NOT NULL,
  video_url TEXT NOT NULL,
  thumb_url TEXT NULL,
  duration_ms INT NULL,
  width INT NULL,
  height INT NULL,
  captured_at DATETIME NULL,
  source_mid VARCHAR(64) NULL,
  PRIMARY KEY (id),
  KEY property_videos_property_idx (property_id),
  CONSTRAINT property_videos_property_fk
    FOREIGN KEY (property_id) REFERENCES properties(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE messages (
  id BIGINT NOT NULL AUTO_INCREMENT,
  sender_id INT UNSIGNED NOT NULL,
  receiver_id INT UNSIGNED NOT NULL,
  content TEXT NOT NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY messages_sender_idx (sender_id),
  KEY messages_receiver_idx (receiver_id),
  KEY messages_created_at_idx (created_at),
  CONSTRAINT messages_sender_fk
    FOREIGN KEY (sender_id) REFERENCES users(id)
    ON DELETE CASCADE,
  CONSTRAINT messages_receiver_fk
    FOREIGN KEY (receiver_id) REFERENCES users(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE favorites (
  id BIGINT NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  property_id BIGINT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY favorites_user_property_unique (user_id, property_id),
  KEY favorites_user_idx (user_id),
  KEY favorites_property_idx (property_id),
  CONSTRAINT favorites_user_fk
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE,
  CONSTRAINT favorites_property_fk
    FOREIGN KEY (property_id) REFERENCES properties(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE search_history (
  id BIGINT NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  keyword VARCHAR(255) NULL,
  requirement VARCHAR(255) NULL,
  province VARCHAR(128) NULL,
  district VARCHAR(128) NULL,
  category VARCHAR(64) NULL,
  room_type VARCHAR(64) NULL,
  price_min DECIMAL(10,2) NULL,
  price_max DECIMAL(10,2) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY search_history_user_idx (user_id),
  KEY search_history_created_idx (created_at),
  CONSTRAINT search_history_user_fk
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE traffic_visits (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  visit_date VARCHAR(10) NOT NULL,
  ip_address VARCHAR(64) NOT NULL,
  path VARCHAR(255) NOT NULL,
  user_agent VARCHAR(512) NULL,
  user_id INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY traffic_visits_date_idx (visit_date),
  KEY traffic_visits_ip_idx (ip_address),
  KEY traffic_visits_created_idx (created_at),
  KEY traffic_visits_user_idx (user_id),
  CONSTRAINT traffic_visits_user_fk
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE site_settings (
  setting_key VARCHAR(128) NOT NULL,
  setting_value TEXT NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (setting_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE group_chats (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE group_members (
  id BIGINT NOT NULL AUTO_INCREMENT,
  group_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  role INT NOT NULL DEFAULT 0,
  joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY gm_group_user_idx (group_id, user_id),
  KEY gm_user_idx (user_id),
  CONSTRAINT group_members_group_fk
    FOREIGN KEY (group_id) REFERENCES group_chats(id)
    ON DELETE CASCADE,
  CONSTRAINT group_members_user_fk
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE group_messages (
  id BIGINT NOT NULL AUTO_INCREMENT,
  group_id INT UNSIGNED NOT NULL,
  sender_id INT UNSIGNED NOT NULL,
  content TEXT NOT NULL,
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY gm_group_idx (group_id),
  KEY gm_created_idx (created_at),
  KEY gm_sender_idx (sender_id),
  CONSTRAINT group_messages_group_fk
    FOREIGN KEY (group_id) REFERENCES group_chats(id)
    ON DELETE CASCADE,
  CONSTRAINT group_messages_sender_fk
    FOREIGN KEY (sender_id) REFERENCES users(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE roommate_posts (
  id BIGINT NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  content TEXT NOT NULL,
  images LONGTEXT NULL,
  province VARCHAR(128) NULL,
  district VARCHAR(128) NULL,
  budget INT NULL,
  gender VARCHAR(32) NULL,
  slots INT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY roommate_posts_user_idx (user_id),
  KEY roommate_posts_created_idx (created_at),
  CONSTRAINT roommate_posts_user_fk
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE roommate_likes (
  id BIGINT NOT NULL AUTO_INCREMENT,
  post_id BIGINT NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY roommate_likes_post_idx (post_id),
  KEY roommate_likes_user_post_idx (user_id, post_id),
  CONSTRAINT roommate_likes_post_fk
    FOREIGN KEY (post_id) REFERENCES roommate_posts(id)
    ON DELETE CASCADE,
  CONSTRAINT roommate_likes_user_fk
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE roommate_comments (
  id BIGINT NOT NULL AUTO_INCREMENT,
  post_id BIGINT NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  content TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY roommate_comments_post_idx (post_id),
  KEY roommate_comments_user_idx (user_id),
  CONSTRAINT roommate_comments_post_fk
    FOREIGN KEY (post_id) REFERENCES roommate_posts(id)
    ON DELETE CASCADE,
  CONSTRAINT roommate_comments_user_fk
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
