-- MySQL dump 10.13  Distrib 8.0.43, for Linux (x86_64)
--
-- Host: localhost    Database: DACSII
-- ------------------------------------------------------
-- Server version	8.0.43

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `accounts`
--

DROP TABLE IF EXISTS `accounts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `accounts` (
  `id` varchar(36) NOT NULL COMMENT 'UUID cß╗ºa t├ái khoß║ún',
  `email` varchar(255) NOT NULL,
  `password_hash` varchar(255) DEFAULT NULL COMMENT 'NULL nß║┐u ─æ─âng nhß║¡p qua social provider',
  `provider` varchar(50) NOT NULL DEFAULT 'local' COMMENT 'e.g., local, google, facebook',
  `status` varchar(20) NOT NULL DEFAULT 'active' COMMENT 'e.g., active, inactive, banned',
  `is_verified` tinyint(1) NOT NULL DEFAULT '0',
  `last_login` timestamp NULL DEFAULT NULL,
  `two_factor_enabled` tinyint(1) NOT NULL DEFAULT '0',
  `two_factor_secret` varchar(255) DEFAULT NULL,
  `two_factor_recovery_codes` text,
  `user_profile_id` varchar(36) NOT NULL,
  `role_id` int NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `verification_code_expires_at` datetime DEFAULT NULL,
  `verification_code` varchar(100) DEFAULT NULL,
  `hashed_refresh_token` varchar(255) DEFAULT NULL COMMENT 'L╞░u refresh token ─æ├ú ─æ╞░ß╗úc hash cß╗ºa ng╞░ß╗¥i d├╣ng',
  `google_access_token` text COMMENT 'Google OAuth access token, d├╣ng ─æß╗â revoke khi logout',
  `password_reset_token` varchar(255) DEFAULT NULL,
  `password_reset_expires` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  UNIQUE KEY `user_profile_id` (`user_profile_id`),
  KEY `role_id` (`role_id`),
  KEY `idx_accounts_status` (`status`),
  KEY `idx_accounts_provider` (`provider`),
  CONSTRAINT `accounts_ibfk_1` FOREIGN KEY (`user_profile_id`) REFERENCES `user_profiles` (`id`) ON DELETE CASCADE,
  CONSTRAINT `accounts_ibfk_2` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='L╞░u trß╗» th├┤ng tin ─æ─âng nhß║¡p v├á x├íc thß╗▒c';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `addresses`
--

DROP TABLE IF EXISTS `addresses`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `addresses` (
  `id` varchar(36) NOT NULL,
  `street` varchar(255) NOT NULL,
  `ward_id` int NOT NULL,
  `cityId` int NOT NULL,
  `latitude` decimal(10,8) DEFAULT NULL,
  `longitude` decimal(11,8) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `addresses_ibfk_1` (`ward_id`),
  KEY `idx_address_location` (`cityId`,`ward_id`),
  CONSTRAINT `addresses_ibfk_1` FOREIGN KEY (`ward_id`) REFERENCES `wards` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_addresses_cities` FOREIGN KEY (`cityId`) REFERENCES `cities` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='L╞░u trß╗» ─æß╗ïa chß╗ë chi tiß║┐t';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `bookings`
--

DROP TABLE IF EXISTS `bookings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `bookings` (
  `id` varchar(36) NOT NULL,
  `code` varchar(20) DEFAULT NULL,
  `booking_date` date NOT NULL,
  `total_price` decimal(10,2) NOT NULL,
  `status` enum('pending','completed','cancelled','in_progress','finished') DEFAULT 'pending',
  `check_in_at` timestamp NULL DEFAULT NULL,
  `user_profile_id` varchar(36) DEFAULT NULL,
  `customer_name` varchar(100) DEFAULT NULL,
  `customer_phone` varchar(20) DEFAULT NULL,
  `field_id` varchar(36) NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `start_time` datetime NOT NULL,
  `end_time` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`),
  KEY `idx_bookings_status` (`status`),
  KEY `idx_bookings_user_profile_id` (`user_profile_id`),
  KEY `idx_bookings_booking_date` (`booking_date`),
  KEY `idx_booking_time` (`field_id`,`start_time`,`end_time`),
  KEY `idx_booking_field_date` (`field_id`,`booking_date`),
  CONSTRAINT `bookings_ibfk_1` FOREIGN KEY (`user_profile_id`) REFERENCES `user_profiles` (`id`),
  CONSTRAINT `bookings_ibfk_2` FOREIGN KEY (`field_id`) REFERENCES `fields` (`id`),
  CONSTRAINT `chk_booking_time_logic` CHECK ((`end_time` > `start_time`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `branches`
--

DROP TABLE IF EXISTS `branches`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `branches` (
  `id` varchar(36) NOT NULL,
  `name` varchar(150) NOT NULL COMMENT 'T├¬n chi nh├ính (VD: S├ón b├│ng ─Éß║íi hß╗ìc Y, C╞í sß╗ƒ 2...)',
  `phone_number` varchar(15) DEFAULT NULL COMMENT 'Hotline ri├¬ng cß╗ºa chi nh├ính',
  `description` text,
  `status` tinyint(1) NOT NULL DEFAULT '1' COMMENT '1: Hoß║ít ─æß╗Öng, 0: Tß║ím dß╗½ng',
  `open_time` time DEFAULT '05:00:00' COMMENT 'Giß╗¥ mß╗ƒ cß╗¡a',
  `close_time` time DEFAULT '23:00:00' COMMENT 'Giß╗¥ ─æ├│ng cß╗¡a',
  `address_id` varchar(36) NOT NULL,
  `manager_id` varchar(36) DEFAULT NULL COMMENT 'ID cß╗ºa ng╞░ß╗¥i quß║ún l├╜ chi nh├ính (c├│ thß╗â null)',
  `created_by_id` varchar(36) DEFAULT NULL COMMENT 'ID cß╗ºa ng╞░ß╗¥i d├╣ng ─æ├ú tß║ío chi nh├ính',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_branches_manager` (`manager_id`),
  KEY `idx_branches_address` (`address_id`),
  KEY `fk_branches_created_by` (`created_by_id`),
  CONSTRAINT `fk_branches_address` FOREIGN KEY (`address_id`) REFERENCES `addresses` (`id`),
  CONSTRAINT `fk_branches_created_by` FOREIGN KEY (`created_by_id`) REFERENCES `user_profiles` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_branches_manager` FOREIGN KEY (`manager_id`) REFERENCES `user_profiles` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='L╞░u trß╗» th├┤ng tin c├íc chi nh├ính/c╞í sß╗ƒ';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `cities`
--

DROP TABLE IF EXISTS `cities`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `cities` (
  `id` int NOT NULL,
  `name` varchar(100) NOT NULL,
  `type` varchar(50) DEFAULT NULL COMMENT 'e.g., Tß╗ënh, Th├ánh phß╗æ',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `feedback_responses`
--

DROP TABLE IF EXISTS `feedback_responses`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `feedback_responses` (
  `id` varchar(36) NOT NULL,
  `content` text NOT NULL,
  `feedback_id` varchar(36) NOT NULL,
  `responder_id` varchar(36) NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `responder_id` (`responder_id`),
  KEY `idx_feedback_responses_feedback_id` (`feedback_id`),
  CONSTRAINT `feedback_responses_ibfk_1` FOREIGN KEY (`feedback_id`) REFERENCES `feedbacks` (`id`) ON DELETE CASCADE,
  CONSTRAINT `feedback_responses_ibfk_2` FOREIGN KEY (`responder_id`) REFERENCES `user_profiles` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `feedbacks`
--

DROP TABLE IF EXISTS `feedbacks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `feedbacks` (
  `id` varchar(36) NOT NULL,
  `title` varchar(255) NOT NULL,
  `category` varchar(50) NOT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'open' COMMENT 'e.g., open, in_progress, closed',
  `submitter_id` varchar(36) NOT NULL,
  `assignee_id` varchar(36) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `submitter_id` (`submitter_id`),
  KEY `idx_feedbacks_status` (`status`),
  KEY `idx_feedbacks_assignee_id` (`assignee_id`),
  CONSTRAINT `feedbacks_ibfk_1` FOREIGN KEY (`submitter_id`) REFERENCES `user_profiles` (`id`),
  CONSTRAINT `feedbacks_ibfk_2` FOREIGN KEY (`assignee_id`) REFERENCES `user_profiles` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `field_images`
--

DROP TABLE IF EXISTS `field_images`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `field_images` (
  `id` varchar(36) NOT NULL,
  `image_url` text NOT NULL,
  `is_cover` tinyint(1) NOT NULL DEFAULT '0',
  `field_id` varchar(36) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_field_images_field_id` (`field_id`),
  CONSTRAINT `field_images_ibfk_1` FOREIGN KEY (`field_id`) REFERENCES `fields` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `field_types`
--

DROP TABLE IF EXISTS `field_types`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `field_types` (
  `id` varchar(36) NOT NULL,
  `name` varchar(50) DEFAULT NULL COMMENT 'e.g., S├ón 5 ng╞░ß╗¥i, S├ón 7 ng╞░ß╗¥i',
  `description` text,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `field_utilities`
--

DROP TABLE IF EXISTS `field_utilities`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `field_utilities` (
  `field_id` varchar(36) NOT NULL,
  `utility_id` int NOT NULL,
  PRIMARY KEY (`field_id`,`utility_id`),
  KEY `utility_id` (`utility_id`),
  CONSTRAINT `field_utilities_ibfk_1` FOREIGN KEY (`field_id`) REFERENCES `fields` (`id`) ON DELETE CASCADE,
  CONSTRAINT `field_utilities_ibfk_2` FOREIGN KEY (`utility_id`) REFERENCES `utilities` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `fields`
--

DROP TABLE IF EXISTS `fields`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `fields` (
  `id` varchar(36) NOT NULL,
  `branch_id` varchar(36) NOT NULL,
  `name` varchar(150) NOT NULL,
  `description` text,
  `status` tinyint(1) NOT NULL DEFAULT '1' COMMENT '0: Dß╗½ng hoß║ít ─æß╗Öng, 1: Hoß║ít ─æß╗Öng, 2: Bß║úo tr├¼',
  `field_type_id` varchar(36) NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_fields_status` (`status`),
  KEY `idx_fields_field_type_id` (`field_type_id`),
  KEY `idx_fields_branch` (`branch_id`),
  CONSTRAINT `fields_ibfk_1` FOREIGN KEY (`field_type_id`) REFERENCES `field_types` (`id`),
  CONSTRAINT `fk_fields_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='L╞░u trß╗» th├┤ng tin vß╗ü c├íc s├ón b├│ng';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `migrations`
--

DROP TABLE IF EXISTS `migrations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `migrations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `timestamp` bigint NOT NULL,
  `name` varchar(255) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `notifications`
--

DROP TABLE IF EXISTS `notifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notifications` (
  `id` varchar(36) NOT NULL,
  `title` varchar(255) NOT NULL,
  `content` text NOT NULL,
  `is_read` tinyint(1) NOT NULL DEFAULT '0',
  `recipient_id` varchar(36) NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_notifications_recipient_id` (`recipient_id`),
  KEY `idx_notifications_is_read` (`is_read`),
  CONSTRAINT `notifications_ibfk_1` FOREIGN KEY (`recipient_id`) REFERENCES `user_profiles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `payments`
--

DROP TABLE IF EXISTS `payments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `payments` (
  `id` varchar(36) NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `final_amount` decimal(10,2) NOT NULL,
  `status` enum('pending','completed','failed') NOT NULL DEFAULT 'pending' COMMENT 'e.g., pending, completed, failed',
  `payment_method` enum('cash','momo','vnpay','banking') NOT NULL DEFAULT 'cash',
  `transaction_code` varchar(100) DEFAULT NULL,
  `bank_code` varchar(50) DEFAULT NULL,
  `booking_id` varchar(36) NOT NULL,
  `voucher_id` varchar(36) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `completed_at` timestamp NULL DEFAULT NULL COMMENT 'Thß╗¥i ─æiß╗âm giao dß╗ïch ─æ╞░ß╗úc x├íc nhß║¡n th├ánh c├┤ng',
  PRIMARY KEY (`id`),
  KEY `voucher_id` (`voucher_id`),
  KEY `idx_payments_status` (`status`),
  KEY `payments_ibfk_1` (`booking_id`),
  KEY `idx_transaction_code` (`transaction_code`),
  CONSTRAINT `payments_ibfk_1` FOREIGN KEY (`booking_id`) REFERENCES `bookings` (`id`),
  CONSTRAINT `payments_ibfk_2` FOREIGN KEY (`voucher_id`) REFERENCES `vouchers` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `reviews`
--

DROP TABLE IF EXISTS `reviews`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `reviews` (
  `id` varchar(36) NOT NULL,
  `rating` int NOT NULL,
  `comment` text,
  `booking_id` varchar(36) NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `field_id` varchar(36) NOT NULL,
  `user_profile_id` varchar(36) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_one_review_per_booking` (`booking_id`),
  KEY `fk_reviews_user` (`user_profile_id`),
  KEY `idx_reviews_field` (`field_id`),
  CONSTRAINT `fk_reviews_booking` FOREIGN KEY (`booking_id`) REFERENCES `bookings` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_reviews_field` FOREIGN KEY (`field_id`) REFERENCES `fields` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_reviews_user` FOREIGN KEY (`user_profile_id`) REFERENCES `user_profiles` (`id`) ON DELETE CASCADE,
  CONSTRAINT `reviews_chk_1` CHECK (((`rating` >= 1) and (`rating` <= 5)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `roles`
--

DROP TABLE IF EXISTS `roles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `roles` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(50) NOT NULL COMMENT 'T├¬n vai tr├▓ (e.g., admin, user, field_owner)',
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='L╞░u trß╗» c├íc vai tr├▓ trong hß╗ç thß╗æng';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `time_slots`
--

DROP TABLE IF EXISTS `time_slots`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `time_slots` (
  `id` int NOT NULL AUTO_INCREMENT,
  `start_time` time NOT NULL,
  `end_time` time NOT NULL,
  `price` decimal(10,2) NOT NULL,
  `is_peak_hour` tinyint(1) NOT NULL DEFAULT '0',
  `field_type_id` varchar(36) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `start_time` (`start_time`,`end_time`,`field_type_id`),
  KEY `field_type_id` (`field_type_id`),
  CONSTRAINT `time_slots_ibfk_1` FOREIGN KEY (`field_type_id`) REFERENCES `field_types` (`id`) ON DELETE CASCADE,
  CONSTRAINT `chk_timeslot_logic` CHECK ((`end_time` > `start_time`))
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='L╞░u trß╗» c├íc khung giß╗¥ v├á gi├í t╞░╞íng ß╗⌐ng';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `user_profiles`
--

DROP TABLE IF EXISTS `user_profiles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_profiles` (
  `id` varchar(36) NOT NULL COMMENT 'UUID cß╗ºa hß╗ô s╞í ng╞░ß╗¥i d├╣ng',
  `full_name` varchar(100) NOT NULL,
  `date_of_birth` date DEFAULT NULL,
  `gender` enum('male','female','other') DEFAULT NULL,
  `phone_number` varchar(15) DEFAULT NULL,
  `avatar_url` text,
  `bio` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `is_profile_complete` tinyint(1) NOT NULL DEFAULT '0',
  `branch_id` varchar(36) DEFAULT NULL COMMENT 'Chi nh├ính m├á nh├ón vi├¬n/quß║ún l├╜ trß╗▒c thuß╗Öc',
  PRIMARY KEY (`id`),
  UNIQUE KEY `phone_number` (`phone_number`),
  KEY `idx_profiles_branch` (`branch_id`),
  CONSTRAINT `fk_profiles_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='L╞░u trß╗» th├┤ng tin chi tiß║┐t cß╗ºa ng╞░ß╗¥i d├╣ng';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `utilities`
--

DROP TABLE IF EXISTS `utilities`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `utilities` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `icon_url` text,
  `price` decimal(10,2) DEFAULT NULL,
  `type` enum('product','service') NOT NULL,
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=34 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `vouchers`
--

DROP TABLE IF EXISTS `vouchers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `vouchers` (
  `id` varchar(36) NOT NULL,
  `code` varchar(50) NOT NULL,
  `discount_amount` decimal(10,2) DEFAULT NULL,
  `discount_percentage` int DEFAULT NULL,
  `max_discount_amount` decimal(10,2) DEFAULT NULL,
  `min_order_value` decimal(10,2) DEFAULT '0.00',
  `valid_from` datetime NOT NULL,
  `valid_to` datetime NOT NULL,
  `quantity` int NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL,
  `user_profile_id` varchar(36) DEFAULT NULL COMMENT 'ID cß╗ºa ng╞░ß╗¥i d├╣ng sß╗ƒ hß╗»u voucher',
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`),
  KEY `idx_vouchers_valid_to` (`valid_to`),
  KEY `FK_Voucher_UserProfile` (`user_profile_id`),
  CONSTRAINT `FK_Voucher_UserProfile` FOREIGN KEY (`user_profile_id`) REFERENCES `user_profiles` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `wards`
--

DROP TABLE IF EXISTS `wards`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `wards` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `type` varchar(50) DEFAULT NULL COMMENT 'e.g., Ph╞░ß╗¥ng, X├ú, Thß╗ï trß║Ñn',
  `city_id` int NOT NULL,
  PRIMARY KEY (`id`),
  KEY `wards_cities_FK` (`city_id`)
) ENGINE=InnoDB AUTO_INCREMENT=9964 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-01-06  2:16:52
