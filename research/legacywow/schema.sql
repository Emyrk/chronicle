-- MariaDB dump 10.19  Distrib 10.7.4-MariaDB, for debian-linux-gnu (x86_64)
--
-- Host: localhost    Database: main
-- ------------------------------------------------------
-- Server version	10.7.4-MariaDB-1:10.7.4+maria~focal

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `account_api_token`
--

DROP TABLE IF EXISTS `account_api_token`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `account_api_token` (
                                   `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `member_id` int(10) unsigned NOT NULL,
  `token` varchar(512) COLLATE utf8mb3_unicode_ci NOT NULL,
  `purpose` varchar(128) COLLATE utf8mb3_unicode_ci NOT NULL,
  `exp_date` bigint(20) unsigned NOT NULL,
  PRIMARY KEY (`id`),
  KEY `SECONDARY` (`member_id`),
  KEY `TERNARY` (`token`),
  CONSTRAINT `member_must_exist` FOREIGN KEY (`member_id`) REFERENCES `account_member` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `account_member`
--

DROP TABLE IF EXISTS `account_member`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `account_member` (
                                `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `nickname` varchar(255) COLLATE utf8mb3_unicode_ci NOT NULL,
  `mail` varchar(255) COLLATE utf8mb3_unicode_ci NOT NULL,
  `password` varchar(1025) COLLATE utf8mb3_unicode_ci NOT NULL,
  `salt` varchar(128) COLLATE utf8mb3_unicode_ci NOT NULL,
  `joined` int(11) unsigned NOT NULL DEFAULT 0,
  `mail_confirmed` tinyint(1) unsigned NOT NULL DEFAULT 0,
  `forgot_password` tinyint(1) unsigned NOT NULL DEFAULT 0,
  `delete_account` tinyint(1) unsigned NOT NULL DEFAULT 0,
  `new_mail` varchar(255) COLLATE utf8mb3_unicode_ci NOT NULL,
  `access_rights` int(11) unsigned NOT NULL DEFAULT 0,
  `default_privacy_type` tinyint(1) unsigned NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `am_unique_name` (`nickname`),
  UNIQUE KEY `am_unique_mail` (`mail`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `account_privacy_group`
--

DROP TABLE IF EXISTS `account_privacy_group`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `account_privacy_group` (
                                       `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `group_name` varchar(64) COLLATE utf8mb3_unicode_ci NOT NULL,
  `member_id` int(11) unsigned NOT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_apg_member_id` (`member_id`),
  CONSTRAINT `fk_apg_member_id` FOREIGN KEY (`member_id`) REFERENCES `account_member` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `account_privacy_group_member`
--

DROP TABLE IF EXISTS `account_privacy_group_member`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `account_privacy_group_member` (
                                              `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `group_id` int(11) unsigned NOT NULL,
  `member_id` int(11) unsigned NOT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_apgm_group_id` (`group_id`),
  KEY `fk_apgm_member_id` (`member_id`),
  CONSTRAINT `fk_apgm_group_id` FOREIGN KEY (`group_id`) REFERENCES `account_privacy_group` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_apgm_member_id` FOREIGN KEY (`member_id`) REFERENCES `account_member` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `armory_arena_team`
--

DROP TABLE IF EXISTS `armory_arena_team`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `armory_arena_team` (
                                   `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `server_uid` bigint(20) unsigned NOT NULL DEFAULT 0,
  `server_id` int(11) unsigned NOT NULL,
  `team_name` varchar(32) COLLATE utf8mb3_unicode_ci NOT NULL,
  `size_type` tinyint(3) unsigned NOT NULL,
  PRIMARY KEY (`id`),
  KEY `FK_aat_server_id` (`server_id`),
  CONSTRAINT `FK_aat_server_id` FOREIGN KEY (`server_id`) REFERENCES `data_server` (`id`) ON DELETE NO ACTION ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `armory_character`
--

DROP TABLE IF EXISTS `armory_character`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `armory_character` (
                                  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `server_id` int(11) unsigned NOT NULL,
  `server_uid` bigint(20) unsigned NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ac_unique` (`server_id`,`server_uid`),
  KEY `ac_server_id` (`server_id`),
  CONSTRAINT `ac_server_id` FOREIGN KEY (`server_id`) REFERENCES `data_server` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `armory_character_facial`
--

DROP TABLE IF EXISTS `armory_character_facial`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `armory_character_facial` (
                                         `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `skin_color` smallint(3) unsigned NOT NULL,
  `face_style` smallint(3) unsigned NOT NULL,
  `hair_style` smallint(3) unsigned NOT NULL,
  `hair_color` smallint(3) unsigned NOT NULL,
  `facial_hair` smallint(3) unsigned NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `acf_unique` (`skin_color`,`face_style`,`hair_style`,`hair_color`,`facial_hair`),
  KEY `acf_value_key` (`skin_color`,`face_style`,`hair_style`,`hair_color`,`facial_hair`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `armory_character_history`
--

DROP TABLE IF EXISTS `armory_character_history`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `armory_character_history` (
                                          `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `character_id` int(11) unsigned NOT NULL,
  `character_info_id` int(11) unsigned NOT NULL,
  `character_name` varchar(64) COLLATE utf8mb3_unicode_ci NOT NULL,
  `guild_id` int(11) unsigned DEFAULT NULL,
  `guild_rank` tinyint(3) unsigned DEFAULT NULL,
  `title` smallint(5) unsigned DEFAULT NULL,
  `prof_skill_points1` smallint(5) unsigned DEFAULT NULL,
  `prof_skill_points2` smallint(5) unsigned DEFAULT NULL,
  `facial` int(11) unsigned DEFAULT NULL,
  `arena2` int(11) unsigned DEFAULT NULL,
  `arena3` int(11) unsigned DEFAULT NULL,
  `arena5` int(11) unsigned DEFAULT NULL,
  `timestamp` bigint(20) unsigned NOT NULL DEFAULT unix_timestamp(),
  PRIMARY KEY (`id`),
  KEY `ach_guild_id` (`guild_id`),
  KEY `ach_character_id` (`character_id`),
  KEY `ach_character_info_id` (`character_info_id`),
  KEY `ach_title` (`title`),
  KEY `ach_facial` (`facial`),
  KEY `ach_value_key` (`character_id`,`character_info_id`,`character_name`,`guild_id`,`guild_rank`,`title`,`prof_skill_points1`,`prof_skill_points2`,`facial`),
  KEY `ach_guild_rank` (`guild_id`,`guild_rank`),
  KEY `ach_arena2` (`arena2`),
  KEY `ach_arena3` (`arena3`),
  KEY `ach_arena5` (`arena5`),
  CONSTRAINT `ach_arena2` FOREIGN KEY (`arena2`) REFERENCES `armory_arena_team` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `ach_arena3` FOREIGN KEY (`arena3`) REFERENCES `armory_arena_team` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `ach_arena5` FOREIGN KEY (`arena5`) REFERENCES `armory_arena_team` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `ach_character_id` FOREIGN KEY (`character_id`) REFERENCES `armory_character` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `ach_character_info_id` FOREIGN KEY (`character_info_id`) REFERENCES `armory_character_info` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `ach_facial` FOREIGN KEY (`facial`) REFERENCES `armory_character_facial` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `ach_guild_id` FOREIGN KEY (`guild_id`) REFERENCES `armory_guild` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `ach_guild_rank` FOREIGN KEY (`guild_id`, `guild_rank`) REFERENCES `armory_guild_rank` (`guild_id`, `rank_index`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `ach_title` FOREIGN KEY (`title`) REFERENCES `data_title` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `armory_character_info`
--

DROP TABLE IF EXISTS `armory_character_info`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `armory_character_info` (
                                       `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `gear_id` int(11) unsigned NOT NULL,
  `hero_class_id` tinyint(3) unsigned NOT NULL,
  `level` tinyint(3) unsigned NOT NULL,
  `gender` binary(1) NOT NULL,
  `profession1` smallint(5) unsigned DEFAULT NULL,
  `profession2` smallint(5) unsigned DEFAULT NULL,
  `talent_specialization` varchar(160) COLLATE utf8mb3_unicode_ci DEFAULT NULL,
  `race_id` tinyint(3) unsigned NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `aci_unique` (`gear_id`,`hero_class_id`,`level`,`gender`,`profession1`,`profession2`,`talent_specialization`,`race_id`),
  KEY `aci_hero_class` (`hero_class_id`),
  KEY `aci_race` (`race_id`),
  KEY `aci_prof1` (`profession1`),
  KEY `aci_prof2` (`profession2`),
  KEY `aci_gear_id` (`gear_id`),
  KEY `aci_value_key` (`gear_id`,`hero_class_id`,`level`,`gender`,`profession1`,`profession2`,`talent_specialization`,`race_id`),
  CONSTRAINT `aci_gear_id` FOREIGN KEY (`gear_id`) REFERENCES `armory_gear` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `aci_hero_class` FOREIGN KEY (`hero_class_id`) REFERENCES `data_hero_class` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `aci_prof1` FOREIGN KEY (`profession1`) REFERENCES `data_profession` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `aci_prof2` FOREIGN KEY (`profession2`) REFERENCES `data_profession` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `aci_race` FOREIGN KEY (`race_id`) REFERENCES `data_race` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `armory_gear`
--

DROP TABLE IF EXISTS `armory_gear`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `armory_gear` (
                             `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `head` int(11) unsigned DEFAULT NULL,
  `neck` int(11) unsigned DEFAULT NULL,
  `shoulder` int(11) unsigned DEFAULT NULL,
  `back` int(11) unsigned DEFAULT NULL,
  `chest` int(11) unsigned DEFAULT NULL,
  `shirt` int(11) unsigned DEFAULT NULL,
  `tabard` int(11) unsigned DEFAULT NULL,
  `wrist` int(11) unsigned DEFAULT NULL,
  `main_hand` int(11) unsigned DEFAULT NULL,
  `off_hand` int(11) unsigned DEFAULT NULL,
  `ternary_hand` int(11) unsigned DEFAULT NULL,
  `glove` int(11) unsigned DEFAULT NULL,
  `belt` int(11) unsigned DEFAULT NULL,
  `leg` int(11) unsigned DEFAULT NULL,
  `boot` int(11) unsigned DEFAULT NULL,
  `ring1` int(11) unsigned DEFAULT NULL,
  `ring2` int(11) unsigned DEFAULT NULL,
  `trinket1` int(11) unsigned DEFAULT NULL,
  `trinket2` int(11) unsigned DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ag_unique` (`head`,`neck`,`shoulder`,`back`,`chest`,`shirt`,`tabard`,`wrist`,`main_hand`,`off_hand`,`ternary_hand`,`glove`,`belt`,`leg`,`boot`,`ring1`,`ring2`,`trinket1`,`trinket2`),
  KEY `ag_slot1` (`head`),
  KEY `ag_slot2` (`neck`),
  KEY `ag_slot3` (`shoulder`),
  KEY `ag_slot4` (`back`),
  KEY `ag_slot5` (`chest`),
  KEY `ag_slot6` (`shirt`),
  KEY `ag_slot7` (`tabard`),
  KEY `ag_slot8` (`wrist`),
  KEY `ag_slot9` (`main_hand`),
  KEY `ag_slot10` (`off_hand`),
  KEY `ag_slot11` (`ternary_hand`),
  KEY `ag_slot12` (`glove`),
  KEY `ag_slot14` (`leg`),
  KEY `ag_slot15` (`boot`),
  KEY `ag_slot16` (`ring1`),
  KEY `ag_slot17` (`ring2`),
  KEY `ag_slot18` (`trinket1`),
  KEY `ag_slot19` (`trinket2`),
  KEY `ag_slot13` (`belt`),
  KEY `ag_value_key` (`head`,`neck`,`shoulder`,`back`,`chest`,`shirt`,`tabard`,`wrist`,`main_hand`,`off_hand`,`ternary_hand`,`glove`,`belt`,`leg`,`boot`,`ring1`,`ring2`,`trinket1`,`trinket2`),
  CONSTRAINT `ag_slot1` FOREIGN KEY (`head`) REFERENCES `armory_item` (`id`) ON DELETE SET NULL ON UPDATE SET NULL,
  CONSTRAINT `ag_slot10` FOREIGN KEY (`off_hand`) REFERENCES `armory_item` (`id`) ON DELETE SET NULL ON UPDATE SET NULL,
  CONSTRAINT `ag_slot11` FOREIGN KEY (`ternary_hand`) REFERENCES `armory_item` (`id`) ON DELETE SET NULL ON UPDATE SET NULL,
  CONSTRAINT `ag_slot12` FOREIGN KEY (`glove`) REFERENCES `armory_item` (`id`) ON DELETE SET NULL ON UPDATE SET NULL,
  CONSTRAINT `ag_slot13` FOREIGN KEY (`belt`) REFERENCES `armory_item` (`id`) ON DELETE SET NULL ON UPDATE SET NULL,
  CONSTRAINT `ag_slot14` FOREIGN KEY (`leg`) REFERENCES `armory_item` (`id`) ON DELETE SET NULL ON UPDATE SET NULL,
  CONSTRAINT `ag_slot15` FOREIGN KEY (`boot`) REFERENCES `armory_item` (`id`) ON DELETE SET NULL ON UPDATE SET NULL,
  CONSTRAINT `ag_slot16` FOREIGN KEY (`ring1`) REFERENCES `armory_item` (`id`) ON DELETE SET NULL ON UPDATE SET NULL,
  CONSTRAINT `ag_slot17` FOREIGN KEY (`ring2`) REFERENCES `armory_item` (`id`) ON DELETE SET NULL ON UPDATE SET NULL,
  CONSTRAINT `ag_slot18` FOREIGN KEY (`trinket1`) REFERENCES `armory_item` (`id`) ON DELETE SET NULL ON UPDATE SET NULL,
  CONSTRAINT `ag_slot19` FOREIGN KEY (`trinket2`) REFERENCES `armory_item` (`id`) ON DELETE SET NULL ON UPDATE SET NULL,
  CONSTRAINT `ag_slot2` FOREIGN KEY (`neck`) REFERENCES `armory_item` (`id`) ON DELETE SET NULL ON UPDATE SET NULL,
  CONSTRAINT `ag_slot3` FOREIGN KEY (`shoulder`) REFERENCES `armory_item` (`id`) ON DELETE SET NULL ON UPDATE SET NULL,
  CONSTRAINT `ag_slot4` FOREIGN KEY (`back`) REFERENCES `armory_item` (`id`) ON DELETE SET NULL ON UPDATE SET NULL,
  CONSTRAINT `ag_slot5` FOREIGN KEY (`chest`) REFERENCES `armory_item` (`id`) ON DELETE SET NULL ON UPDATE SET NULL,
  CONSTRAINT `ag_slot6` FOREIGN KEY (`shirt`) REFERENCES `armory_item` (`id`) ON DELETE SET NULL ON UPDATE SET NULL,
  CONSTRAINT `ag_slot7` FOREIGN KEY (`tabard`) REFERENCES `armory_item` (`id`) ON DELETE SET NULL ON UPDATE SET NULL,
  CONSTRAINT `ag_slot8` FOREIGN KEY (`wrist`) REFERENCES `armory_item` (`id`) ON DELETE SET NULL ON UPDATE SET NULL,
  CONSTRAINT `ag_slot9` FOREIGN KEY (`main_hand`) REFERENCES `armory_item` (`id`) ON DELETE SET NULL ON UPDATE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `armory_guild`
--

DROP TABLE IF EXISTS `armory_guild`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `armory_guild` (
                              `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `server_uid` bigint(20) unsigned NOT NULL,
  `server_id` int(11) unsigned NOT NULL,
  `guild_name` varchar(64) COLLATE utf8mb3_unicode_ci NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ag_unique_sid_name` (`server_id`,`guild_name`),
  UNIQUE KEY `ag_unique_sid_uid` (`server_uid`,`server_id`),
  KEY `ag_server_id` (`server_id`),
  KEY `ag_value_key` (`server_uid`,`server_id`,`guild_name`),
  CONSTRAINT `ag_server_id` FOREIGN KEY (`server_id`) REFERENCES `data_server` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `armory_guild_rank`
--

DROP TABLE IF EXISTS `armory_guild_rank`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `armory_guild_rank` (
                                   `guild_id` int(11) unsigned NOT NULL,
  `rank_index` tinyint(3) unsigned NOT NULL,
  `name` varchar(32) COLLATE utf8mb3_unicode_ci NOT NULL,
  PRIMARY KEY (`guild_id`,`rank_index`),
  CONSTRAINT `agr_guild_id` FOREIGN KEY (`guild_id`) REFERENCES `armory_guild` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `armory_instance_resets`
--

DROP TABLE IF EXISTS `armory_instance_resets`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `armory_instance_resets` (
                                        `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `server_id` int(11) unsigned NOT NULL,
  `map_id` smallint(5) unsigned NOT NULL,
  `difficulty` tinyint(3) unsigned NOT NULL,
  `reset_time` bigint(20) unsigned NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_value` (`server_id`,`map_id`,`difficulty`,`reset_time`),
  CONSTRAINT `FK_air_server_id` FOREIGN KEY (`server_id`) REFERENCES `data_server` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `armory_item`
--

DROP TABLE IF EXISTS `armory_item`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `armory_item` (
                             `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `item_id` int(11) unsigned NOT NULL,
  `random_property_id` smallint(5) DEFAULT NULL,
  `enchant_id` int(11) unsigned DEFAULT NULL,
  `gem_id1` int(11) unsigned DEFAULT NULL,
  `gem_id2` int(11) unsigned DEFAULT NULL,
  `gem_id3` int(11) unsigned DEFAULT NULL,
  `gem_id4` int(11) unsigned DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ai_unique` (`item_id`,`random_property_id`,`enchant_id`,`gem_id1`,`gem_id2`,`gem_id3`,`gem_id4`),
  KEY `ai_item_id` (`item_id`),
  KEY `ai_random_property_id` (`random_property_id`),
  KEY `ai_enchant_id` (`enchant_id`),
  KEY `ai_gem_id1` (`gem_id1`),
  KEY `ai_gem_id2` (`gem_id2`),
  KEY `ai_gem_id3` (`gem_id3`),
  KEY `ai_gem_id4` (`gem_id4`),
  KEY `ai_value_key` (`item_id`,`random_property_id`,`enchant_id`,`gem_id1`,`gem_id2`,`gem_id3`,`gem_id4`),
  CONSTRAINT `ai_enchant_id` FOREIGN KEY (`enchant_id`) REFERENCES `data_enchant` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `ai_gem_id1` FOREIGN KEY (`gem_id1`) REFERENCES `data_gem` (`item_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `ai_gem_id2` FOREIGN KEY (`gem_id2`) REFERENCES `data_gem` (`item_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `ai_gem_id3` FOREIGN KEY (`gem_id3`) REFERENCES `data_gem` (`item_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `ai_gem_id4` FOREIGN KEY (`gem_id4`) REFERENCES `data_gem` (`item_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `ai_item_id` FOREIGN KEY (`item_id`) REFERENCES `data_item` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `ai_random_property` FOREIGN KEY (`random_property_id`) REFERENCES `data_item_random_property` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `data_addon`
--

DROP TABLE IF EXISTS `data_addon`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `data_addon` (
                            `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `expansion_id` tinyint(1) unsigned NOT NULL,
  `addon_name` varchar(128) COLLATE utf8mb3_unicode_ci NOT NULL,
  `addon_desc` varchar(2048) COLLATE utf8mb3_unicode_ci NOT NULL,
  `url_name` varchar(128) COLLATE utf8mb3_unicode_ci NOT NULL,
  PRIMARY KEY (`id`),
  KEY `d_addon_expansion_id` (`expansion_id`),
  CONSTRAINT `d_addon_expansion_id` FOREIGN KEY (`expansion_id`) REFERENCES `data_expansion` (`id`) ON UPDATE CASCADE
  ) ENGINE=InnoDB AUTO_INCREMENT=973 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `data_difficulty`
--

DROP TABLE IF EXISTS `data_difficulty`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `data_difficulty` (
                                 `id` tinyint(3) unsigned NOT NULL,
  `localization_id` int(11) unsigned NOT NULL,
  `icon` varchar(100) COLLATE utf8mb3_unicode_ci NOT NULL,
  PRIMARY KEY (`id`),
  KEY `dd_localization_id` (`localization_id`),
  CONSTRAINT `dd_localization_id` FOREIGN KEY (`localization_id`) REFERENCES `data_localization` (`id`) ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `data_enchant`
--

DROP TABLE IF EXISTS `data_enchant`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `data_enchant` (
                              `expansion_id` tinyint(3) unsigned NOT NULL,
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `localization_id` int(11) unsigned NOT NULL,
  `stat_type1` tinyint(3) unsigned DEFAULT NULL,
  `stat_value1` smallint(5) unsigned DEFAULT NULL,
  `stat_type2` tinyint(3) unsigned DEFAULT NULL,
  `stat_value2` smallint(5) unsigned DEFAULT NULL,
  `stat_type3` tinyint(3) unsigned DEFAULT NULL,
  `stat_value3` smallint(5) unsigned DEFAULT NULL,
  PRIMARY KEY (`expansion_id`,`id`),
  KEY `id` (`id`),
  KEY `dets_stat_type1` (`stat_type1`),
  KEY `dets_stat_type2` (`stat_type2`),
  KEY `dets_stat_type3` (`stat_type3`),
  CONSTRAINT `dets_expansion_id` FOREIGN KEY (`expansion_id`) REFERENCES `data_expansion` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `dets_stat_type1` FOREIGN KEY (`stat_type1`) REFERENCES `data_stat_type` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `dets_stat_type2` FOREIGN KEY (`stat_type2`) REFERENCES `data_stat_type` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `dets_stat_type3` FOREIGN KEY (`stat_type3`) REFERENCES `data_stat_type` (`id`) ON UPDATE CASCADE
  ) ENGINE=InnoDB AUTO_INCREMENT=46852 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `data_encounter`
--

DROP TABLE IF EXISTS `data_encounter`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `data_encounter` (
                                `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `localization_id` int(11) unsigned NOT NULL,
  `map_id` smallint(6) unsigned NOT NULL,
  `retail_id` int(11) unsigned DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `denc_localization_id` (`localization_id`),
  KEY `denc_map_id` (`map_id`),
  CONSTRAINT `denc_localization_id` FOREIGN KEY (`localization_id`) REFERENCES `data_localization` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `denc_map_id` FOREIGN KEY (`map_id`) REFERENCES `data_map` (`id`) ON UPDATE CASCADE
  ) ENGINE=InnoDB AUTO_INCREMENT=166 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `data_encounter_npcs`
--

DROP TABLE IF EXISTS `data_encounter_npcs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `data_encounter_npcs` (
                                     `encounter_id` int(11) unsigned NOT NULL,
  `npc_id` int(11) unsigned NOT NULL,
  `requires_death` tinyint(1) NOT NULL DEFAULT 1,
  `can_start_encounter` tinyint(1) NOT NULL DEFAULT 1,
  `is_pivot` tinyint(1) NOT NULL DEFAULT 0 COMMENT 'There may only be one per encounter',
  `health_treshold` tinyint(3) unsigned DEFAULT NULL COMMENT 'Between 0 and 100',
  PRIMARY KEY (`encounter_id`,`npc_id`),
  KEY `denc_npc_npc_id` (`npc_id`),
  CONSTRAINT `denc_npc_encounter_id` FOREIGN KEY (`encounter_id`) REFERENCES `data_encounter` (`id`) ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `data_expansion`
--

DROP TABLE IF EXISTS `data_expansion`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `data_expansion` (
                                `id` tinyint(3) unsigned NOT NULL AUTO_INCREMENT,
  `localization_id` int(11) unsigned NOT NULL,
  PRIMARY KEY (`id`),
  KEY `de_localization_id` (`localization_id`),
  CONSTRAINT `de_localization_id` FOREIGN KEY (`localization_id`) REFERENCES `data_localization` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
  ) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `data_gem`
--

DROP TABLE IF EXISTS `data_gem`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `data_gem` (
                          `expansion_id` tinyint(3) unsigned NOT NULL,
  `item_id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `enchant_id` int(11) unsigned NOT NULL,
  `flag` tinyint(3) unsigned NOT NULL,
  PRIMARY KEY (`expansion_id`,`item_id`),
  KEY `id` (`item_id`),
  KEY `dg_enchant_id` (`expansion_id`,`enchant_id`),
  CONSTRAINT `dg_enchant_id` FOREIGN KEY (`expansion_id`, `enchant_id`) REFERENCES `data_enchant` (`expansion_id`, `id`) ON UPDATE CASCADE,
  CONSTRAINT `dg_expansion_id` FOREIGN KEY (`expansion_id`) REFERENCES `data_expansion` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `dg_item_id` FOREIGN KEY (`expansion_id`, `item_id`) REFERENCES `data_item` (`expansion_id`, `id`) ON UPDATE CASCADE
  ) ENGINE=InnoDB AUTO_INCREMENT=49111 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `data_hero_class`
--

DROP TABLE IF EXISTS `data_hero_class`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `data_hero_class` (
                                 `id` tinyint(3) unsigned NOT NULL AUTO_INCREMENT,
  `localization_id` int(11) unsigned NOT NULL,
  `color` varchar(6) COLLATE utf8mb3_unicode_ci NOT NULL,
  PRIMARY KEY (`id`),
  KEY `dhc_localization_id` (`localization_id`),
  CONSTRAINT `dhc_localization_id` FOREIGN KEY (`localization_id`) REFERENCES `data_localization` (`id`) ON UPDATE NO ACTION
  ) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `data_hero_class_spec`
--

DROP TABLE IF EXISTS `data_hero_class_spec`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `data_hero_class_spec` (
                                      `hero_class_id` tinyint(3) unsigned NOT NULL,
  `index` tinyint(3) unsigned NOT NULL,
  `icon` smallint(5) unsigned NOT NULL,
  `localization_id` int(11) unsigned NOT NULL,
  PRIMARY KEY (`hero_class_id`,`index`),
  KEY `dhcp_localization_id` (`localization_id`),
  KEY `dhcp_icon` (`icon`),
  CONSTRAINT `dhcp_hero_class_id` FOREIGN KEY (`hero_class_id`) REFERENCES `data_hero_class` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `dhcp_icon` FOREIGN KEY (`icon`) REFERENCES `data_icon` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `dhcp_localization_id` FOREIGN KEY (`localization_id`) REFERENCES `data_localization` (`id`) ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `data_icon`
--

DROP TABLE IF EXISTS `data_icon`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `data_icon` (
                           `id` smallint(5) unsigned NOT NULL AUTO_INCREMENT,
  `icon` varchar(64) COLLATE utf8mb3_unicode_ci NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `icon_unique` (`icon`)
  ) ENGINE=InnoDB AUTO_INCREMENT=5259 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `data_item`
--

DROP TABLE IF EXISTS `data_item`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `data_item` (
                           `expansion_id` tinyint(3) unsigned NOT NULL,
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `localization_id` int(11) unsigned NOT NULL,
  `icon` smallint(5) unsigned NOT NULL,
  `quality` tinyint(3) unsigned NOT NULL,
  `inventory_type` tinyint(3) unsigned DEFAULT NULL,
  `class_id` tinyint(3) unsigned NOT NULL,
  `required_level` tinyint(3) unsigned DEFAULT NULL,
  `bonding` tinyint(3) unsigned DEFAULT NULL,
  `sheath` tinyint(3) unsigned DEFAULT NULL,
  `itemset` smallint(5) unsigned DEFAULT NULL,
  `max_durability` smallint(5) unsigned DEFAULT NULL,
  `item_level` smallint(5) unsigned DEFAULT NULL,
  `delay` smallint(5) unsigned DEFAULT NULL,
  PRIMARY KEY (`id`,`expansion_id`),
  KEY `di_expansion_id` (`expansion_id`),
  KEY `di_quality` (`quality`),
  KEY `di_bonding` (`bonding`),
  KEY `di_sheath` (`sheath`),
  KEY `di_inventory_type` (`inventory_type`),
  KEY `di_class_id` (`class_id`),
  KEY `di_itemset` (`itemset`),
  KEY `di_localization_id` (`localization_id`),
  KEY `di_icon` (`icon`),
  CONSTRAINT `di_bonding` FOREIGN KEY (`bonding`) REFERENCES `data_item_bonding` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `di_class_id` FOREIGN KEY (`class_id`) REFERENCES `data_item_class` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `di_expansion_id` FOREIGN KEY (`expansion_id`) REFERENCES `data_expansion` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `di_icon` FOREIGN KEY (`icon`) REFERENCES `data_icon` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `di_inventory_type` FOREIGN KEY (`inventory_type`) REFERENCES `data_item_inventory_type` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `di_localization_id` FOREIGN KEY (`localization_id`) REFERENCES `data_localization` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `di_quality` FOREIGN KEY (`quality`) REFERENCES `data_item_quality` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `di_sheath` FOREIGN KEY (`sheath`) REFERENCES `data_item_sheath` (`id`) ON UPDATE CASCADE
  ) ENGINE=InnoDB AUTO_INCREMENT=56807 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `data_item_bonding`
--

DROP TABLE IF EXISTS `data_item_bonding`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `data_item_bonding` (
                                   `id` tinyint(3) unsigned NOT NULL AUTO_INCREMENT,
  `localization_id` int(11) unsigned NOT NULL,
  PRIMARY KEY (`id`),
  KEY `dib_localization_id` (`localization_id`),
  CONSTRAINT `dib_localization_id` FOREIGN KEY (`localization_id`) REFERENCES `data_localization` (`id`) ON UPDATE CASCADE
  ) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `data_item_class`
--

DROP TABLE IF EXISTS `data_item_class`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `data_item_class` (
                                 `id` tinyint(3) unsigned NOT NULL AUTO_INCREMENT,
  `item_class` tinyint(3) unsigned NOT NULL,
  `item_sub_class` tinyint(3) unsigned NOT NULL,
  `localization_id` int(11) unsigned NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `dic_class_unique` (`item_class`,`item_sub_class`),
  KEY `dic_localization_id` (`localization_id`),
  CONSTRAINT `dic_localization_id` FOREIGN KEY (`localization_id`) REFERENCES `data_localization` (`id`) ON UPDATE CASCADE
  ) ENGINE=InnoDB AUTO_INCREMENT=120 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `data_item_display_info`
--

DROP TABLE IF EXISTS `data_item_display_info`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `data_item_display_info` (
                                        `item_id` int(11) unsigned NOT NULL,
  `display_info_id` int(11) unsigned NOT NULL,
  `inventory_type` tinyint(3) unsigned NOT NULL DEFAULT 0,
  PRIMARY KEY (`item_id`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `data_item_dmg`
--

DROP TABLE IF EXISTS `data_item_dmg`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `data_item_dmg` (
                               `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `expansion_id` tinyint(3) unsigned NOT NULL,
  `item_id` int(11) unsigned NOT NULL,
  `dmg_type` tinyint(3) unsigned DEFAULT NULL,
  `dmg_min` smallint(5) unsigned NOT NULL,
  `dmg_max` smallint(5) unsigned NOT NULL,
  PRIMARY KEY (`id`),
  KEY `did_item_id` (`expansion_id`,`item_id`),
  KEY `did_dmg_type` (`dmg_type`),
  CONSTRAINT `did_dmg_type` FOREIGN KEY (`dmg_type`) REFERENCES `data_item_dmg_type` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `did_expansion_id` FOREIGN KEY (`expansion_id`) REFERENCES `data_expansion` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `did_item_id` FOREIGN KEY (`expansion_id`, `item_id`) REFERENCES `data_item` (`expansion_id`, `id`) ON DELETE CASCADE ON UPDATE CASCADE
  ) ENGINE=InnoDB AUTO_INCREMENT=9051 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `data_item_dmg_type`
--

DROP TABLE IF EXISTS `data_item_dmg_type`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `data_item_dmg_type` (
                                    `id` tinyint(3) unsigned NOT NULL AUTO_INCREMENT,
  `localization_id` int(11) unsigned NOT NULL,
  PRIMARY KEY (`id`),
  KEY `didt_localization_id` (`localization_id`),
  CONSTRAINT `didt_localization_id` FOREIGN KEY (`localization_id`) REFERENCES `data_localization` (`id`) ON UPDATE CASCADE
  ) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `data_item_effect`
--

DROP TABLE IF EXISTS `data_item_effect`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `data_item_effect` (
                                  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `expansion_id` tinyint(3) unsigned NOT NULL,
  `item_id` int(11) unsigned NOT NULL,
  `spell_id` int(11) unsigned NOT NULL,
  `cooldown` int(11) NOT NULL,
  `charges` tinyint(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `die2_spell_id` (`expansion_id`,`spell_id`),
  KEY `die2_item_id` (`expansion_id`,`item_id`),
  CONSTRAINT `die2_item_id` FOREIGN KEY (`expansion_id`, `item_id`) REFERENCES `data_item` (`expansion_id`, `id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `die2_spell_id` FOREIGN KEY (`expansion_id`, `spell_id`) REFERENCES `data_spell` (`expansion_id`, `id`) ON DELETE CASCADE ON UPDATE CASCADE
  ) ENGINE=InnoDB AUTO_INCREMENT=56802 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `data_item_inventory_type`
--

DROP TABLE IF EXISTS `data_item_inventory_type`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `data_item_inventory_type` (
                                          `id` tinyint(3) unsigned NOT NULL AUTO_INCREMENT,
  `localization_id` int(11) unsigned NOT NULL,
  PRIMARY KEY (`id`),
  KEY `diit_localization_id` (`localization_id`),
  CONSTRAINT `diit_localization_id` FOREIGN KEY (`localization_id`) REFERENCES `data_localization` (`id`) ON UPDATE CASCADE
  ) ENGINE=InnoDB AUTO_INCREMENT=29 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `data_item_quality`
--

DROP TABLE IF EXISTS `data_item_quality`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `data_item_quality` (
                                   `id` tinyint(3) unsigned NOT NULL AUTO_INCREMENT,
  `localization_id` int(11) unsigned NOT NULL,
  `color` varchar(6) COLLATE utf8mb3_unicode_ci NOT NULL,
  PRIMARY KEY (`id`),
  KEY `diq_localization_id` (`localization_id`),
  CONSTRAINT `diq_localization_id` FOREIGN KEY (`localization_id`) REFERENCES `data_localization` (`id`) ON UPDATE CASCADE
  ) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `data_item_random_property`
--

DROP TABLE IF EXISTS `data_item_random_property`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `data_item_random_property` (
                                           `expansion_id` tinyint(3) unsigned NOT NULL,
  `id` smallint(5) NOT NULL,
  `localization_id` int(11) unsigned NOT NULL,
  `enchant_id1` int(11) unsigned NOT NULL,
  `enchant_id2` int(11) unsigned DEFAULT NULL,
  `enchant_id3` int(11) unsigned DEFAULT NULL,
  `enchant_id4` int(11) unsigned DEFAULT NULL,
  `enchant_id5` int(11) unsigned DEFAULT NULL,
  `scaling_coefficient1` int(11) unsigned DEFAULT NULL,
  `scaling_coefficient2` int(11) unsigned DEFAULT NULL,
  `scaling_coefficient3` int(11) unsigned DEFAULT NULL,
  `scaling_coefficient4` int(11) unsigned DEFAULT NULL,
  `scaling_coefficient5` int(11) unsigned DEFAULT NULL,
  PRIMARY KEY (`expansion_id`,`id`),
  KEY `id` (`id`),
  KEY `dirp_enchant_id1` (`enchant_id1`,`expansion_id`),
  KEY `dirp_enchant_id2` (`enchant_id2`,`expansion_id`),
  KEY `dirp_enchant_id3` (`enchant_id3`,`expansion_id`),
  KEY `dirp_enchant_id4` (`enchant_id4`,`expansion_id`),
  KEY `dirp_enchant_id5` (`enchant_id5`,`expansion_id`),
  KEY `dirp_localization_id` (`localization_id`),
  CONSTRAINT `dirp_enchant_id1` FOREIGN KEY (`enchant_id1`, `expansion_id`) REFERENCES `data_enchant` (`id`, `expansion_id`) ON UPDATE CASCADE,
  CONSTRAINT `dirp_enchant_id2` FOREIGN KEY (`enchant_id2`, `expansion_id`) REFERENCES `data_enchant` (`id`, `expansion_id`) ON UPDATE CASCADE,
  CONSTRAINT `dirp_enchant_id3` FOREIGN KEY (`enchant_id3`, `expansion_id`) REFERENCES `data_enchant` (`id`, `expansion_id`) ON UPDATE CASCADE,
  CONSTRAINT `dirp_enchant_id4` FOREIGN KEY (`enchant_id4`, `expansion_id`) REFERENCES `data_enchant` (`id`, `expansion_id`) ON UPDATE CASCADE,
  CONSTRAINT `dirp_enchant_id5` FOREIGN KEY (`enchant_id5`, `expansion_id`) REFERENCES `data_enchant` (`id`, `expansion_id`) ON UPDATE CASCADE,
  CONSTRAINT `dirp_expansion_id` FOREIGN KEY (`expansion_id`) REFERENCES `data_expansion` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `dirp_localization_id` FOREIGN KEY (`localization_id`) REFERENCES `data_localization` (`id`) ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `data_item_random_property_points`
--

DROP TABLE IF EXISTS `data_item_random_property_points`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `data_item_random_property_points` (
                                                  `item_level` smallint(5) unsigned NOT NULL,
  `expansion_id` tinyint(3) unsigned NOT NULL,
  `epic0` smallint(5) unsigned NOT NULL,
  `epic1` smallint(5) unsigned NOT NULL,
  `epic2` smallint(5) unsigned NOT NULL,
  `epic3` smallint(5) unsigned NOT NULL,
  `epic4` smallint(5) unsigned NOT NULL,
  `rare0` smallint(5) unsigned NOT NULL,
  `rare1` smallint(5) unsigned NOT NULL,
  `rare2` smallint(5) unsigned NOT NULL,
  `rare3` smallint(5) unsigned NOT NULL,
  `rare4` smallint(5) unsigned NOT NULL,
  `good0` smallint(5) unsigned NOT NULL,
  `good1` smallint(5) unsigned NOT NULL,
  `good2` smallint(5) unsigned NOT NULL,
  `good3` smallint(5) unsigned NOT NULL,
  `good4` smallint(5) unsigned NOT NULL,
  PRIMARY KEY (`item_level`,`expansion_id`),
  KEY `dirpp_expansion_id` (`expansion_id`),
  CONSTRAINT `dirpp_expansion_id` FOREIGN KEY (`expansion_id`) REFERENCES `data_expansion` (`id`) ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `data_item_sheath`
--

DROP TABLE IF EXISTS `data_item_sheath`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `data_item_sheath` (
                                  `id` tinyint(3) unsigned NOT NULL AUTO_INCREMENT,
  `localization_id` int(11) unsigned NOT NULL,
  PRIMARY KEY (`id`),
  KEY `dis3_localization_id` (`localization_id`),
  CONSTRAINT `dis3_localization_id` FOREIGN KEY (`localization_id`) REFERENCES `data_localization` (`id`) ON UPDATE CASCADE
  ) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `data_item_socket`
--

DROP TABLE IF EXISTS `data_item_socket`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `data_item_socket` (
                                  `expansion_id` tinyint(3) unsigned NOT NULL,
  `item_id` int(11) unsigned NOT NULL,
  `bonus` int(11) unsigned NOT NULL,
  `slot1` tinyint(3) unsigned NOT NULL,
  `slot2` tinyint(3) unsigned DEFAULT NULL,
  `slot3` tinyint(3) unsigned DEFAULT NULL,
  PRIMARY KEY (`expansion_id`,`item_id`),
  KEY `dis_bonus` (`bonus`,`expansion_id`),
  CONSTRAINT `dis2_item_id` FOREIGN KEY (`expansion_id`, `item_id`) REFERENCES `data_item` (`expansion_id`, `id`) ON DELETE CASCADE ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `data_item_stat`
--

DROP TABLE IF EXISTS `data_item_stat`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `data_item_stat` (
                                `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `expansion_id` tinyint(3) unsigned NOT NULL,
  `item_id` int(11) unsigned NOT NULL,
  `stat_type` tinyint(3) unsigned NOT NULL,
  `stat_value` smallint(5) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `dis_unique` (`expansion_id`,`item_id`,`stat_type`),
  KEY `dis_item_id` (`expansion_id`,`item_id`),
  KEY `dis_stat_type` (`stat_type`),
  CONSTRAINT `dis_expansion_id` FOREIGN KEY (`expansion_id`) REFERENCES `data_expansion` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `dis_item_id` FOREIGN KEY (`expansion_id`, `item_id`) REFERENCES `data_item` (`expansion_id`, `id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `dis_stat_type` FOREIGN KEY (`stat_type`) REFERENCES `data_stat_type` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
  ) ENGINE=InnoDB AUTO_INCREMENT=130758 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `data_itemset_effect`
--

DROP TABLE IF EXISTS `data_itemset_effect`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `data_itemset_effect` (
                                     `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `expansion_id` tinyint(3) unsigned NOT NULL,
  `itemset_id` smallint(5) unsigned NOT NULL,
  `threshold` tinyint(3) unsigned NOT NULL,
  `spell_id` int(11) unsigned NOT NULL,
  PRIMARY KEY (`id`),
  KEY `die_spell_id` (`expansion_id`,`spell_id`),
  KEY `die_itemset_id` (`expansion_id`,`itemset_id`),
  CONSTRAINT `die_expansion_id` FOREIGN KEY (`expansion_id`) REFERENCES `data_expansion` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `die_itemset_id` FOREIGN KEY (`expansion_id`, `itemset_id`) REFERENCES `data_itemset_name` (`expansion_id`, `id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `die_spell_id` FOREIGN KEY (`expansion_id`, `spell_id`) REFERENCES `data_spell` (`expansion_id`, `id`) ON DELETE CASCADE ON UPDATE CASCADE
  ) ENGINE=InnoDB AUTO_INCREMENT=2478 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `data_itemset_name`
--

DROP TABLE IF EXISTS `data_itemset_name`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `data_itemset_name` (
                                   `expansion_id` tinyint(3) unsigned NOT NULL,
  `id` smallint(5) unsigned NOT NULL,
  `localization_id` int(11) unsigned NOT NULL,
  PRIMARY KEY (`expansion_id`,`id`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `data_language`
--

DROP TABLE IF EXISTS `data_language`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `data_language` (
                               `id` tinyint(3) unsigned NOT NULL AUTO_INCREMENT,
  `language` varchar(256) COLLATE utf8mb3_unicode_ci NOT NULL,
  `short_code` varchar(10) COLLATE utf8mb3_unicode_ci NOT NULL,
  PRIMARY KEY (`id`)
  ) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `data_localization`
--

DROP TABLE IF EXISTS `data_localization`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `data_localization` (
                                   `language_id` tinyint(3) unsigned NOT NULL,
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `content` varchar(1024) COLLATE utf8mb3_unicode_ci NOT NULL,
  PRIMARY KEY (`id`,`language_id`),
  KEY `language_id` (`language_id`),
  CONSTRAINT `language_id` FOREIGN KEY (`language_id`) REFERENCES `data_language` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
  ) ENGINE=InnoDB AUTO_INCREMENT=119843 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `data_map`
--

DROP TABLE IF EXISTS `data_map`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `data_map` (
                          `id` smallint(6) unsigned NOT NULL,
  `map_type` tinyint(1) unsigned NOT NULL COMMENT '0 => Raid, 1 => Arena, 2 => Battleground',
  `localization_id` int(11) unsigned NOT NULL,
  `icon` varchar(100) COLLATE utf8mb3_unicode_ci NOT NULL,
  PRIMARY KEY (`id`),
  KEY `dm_localization_id` (`localization_id`),
  CONSTRAINT `dm_localization_id` FOREIGN KEY (`localization_id`) REFERENCES `data_localization` (`id`) ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `data_npc`
--

DROP TABLE IF EXISTS `data_npc`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `data_npc` (
                          `expansion_id` tinyint(3) unsigned NOT NULL,
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `localization_id` int(11) unsigned NOT NULL,
  `is_boss` binary(1) NOT NULL,
  `friend` tinyint(3) unsigned NOT NULL,
  `family` tinyint(3) unsigned NOT NULL,
  `map_id` smallint(5) unsigned DEFAULT NULL,
  PRIMARY KEY (`expansion_id`,`id`),
  KEY `id` (`id`),
  KEY `dn_localization_id` (`localization_id`),
  CONSTRAINT `dn_expansion_id` FOREIGN KEY (`expansion_id`) REFERENCES `data_expansion` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `dn_localization_id` FOREIGN KEY (`localization_id`) REFERENCES `data_localization` (`id`) ON UPDATE CASCADE
  ) ENGINE=InnoDB AUTO_INCREMENT=200421 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `data_profession`
--

DROP TABLE IF EXISTS `data_profession`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `data_profession` (
                                 `id` smallint(5) unsigned NOT NULL AUTO_INCREMENT,
  `localization_id` int(11) unsigned NOT NULL,
  `icon` smallint(5) unsigned NOT NULL,
  PRIMARY KEY (`id`),
  KEY `dp_localization_id` (`localization_id`),
  KEY `dp_icon` (`icon`),
  CONSTRAINT `dp_icon` FOREIGN KEY (`icon`) REFERENCES `data_icon` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `dp_localization_id` FOREIGN KEY (`localization_id`) REFERENCES `data_localization` (`id`) ON UPDATE CASCADE
  ) ENGINE=InnoDB AUTO_INCREMENT=774 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `data_race`
--

DROP TABLE IF EXISTS `data_race`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `data_race` (
                           `id` tinyint(3) unsigned NOT NULL AUTO_INCREMENT,
  `localization_id` int(11) unsigned NOT NULL,
  `faction` binary(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `dr_localization_id` (`localization_id`),
  CONSTRAINT `dr_localization_id` FOREIGN KEY (`localization_id`) REFERENCES `data_localization` (`id`) ON UPDATE CASCADE
  ) ENGINE=InnoDB AUTO_INCREMENT=12 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `data_server`
--

DROP TABLE IF EXISTS `data_server`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `data_server` (
                             `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `expansion_id` tinyint(3) unsigned NOT NULL,
  `server_name` varchar(256) COLLATE utf8mb3_unicode_ci NOT NULL,
  `owner` int(11) unsigned DEFAULT NULL,
  `patch` varchar(20) COLLATE utf8mb3_unicode_ci NOT NULL,
  `retail_id` int(11) unsigned DEFAULT NULL,
  `archived` binary(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `ds_expansion_id` (`expansion_id`),
  KEY `ds_owner` (`owner`),
  CONSTRAINT `ds_expansion_id` FOREIGN KEY (`expansion_id`) REFERENCES `data_expansion` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `ds_owner` FOREIGN KEY (`owner`) REFERENCES `account_member` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
  ) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `data_spell`
--

DROP TABLE IF EXISTS `data_spell`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `data_spell` (
                            `expansion_id` tinyint(3) unsigned NOT NULL,
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `localization_id` int(11) unsigned NOT NULL,
  `subtext_localization_id` int(11) unsigned NOT NULL,
  `cost` smallint(5) unsigned NOT NULL,
  `cost_in_percent` binary(1) NOT NULL DEFAULT '0',
  `power_type` tinyint(3) unsigned NOT NULL,
  `cast_time` int(11) unsigned NOT NULL DEFAULT 0,
  `school_mask` smallint(5) unsigned NOT NULL,
  `dispel_type` tinyint(3) unsigned NOT NULL,
  `range_max` int(11) unsigned NOT NULL,
  `cooldown` int(11) unsigned NOT NULL,
  `duration` int(11) NOT NULL DEFAULT 0,
  `icon` smallint(5) unsigned NOT NULL,
  `description_localization_id` int(11) unsigned NOT NULL,
  `aura_localization_id` int(11) unsigned NOT NULL,
  PRIMARY KEY (`expansion_id`,`id`),
  KEY `id` (`id`),
  KEY `dsp_dispel_type` (`dispel_type`),
  KEY `dps_subtext_localization_id` (`subtext_localization_id`),
  KEY `dsp_aura_localization_id` (`aura_localization_id`),
  KEY `dsp_description_localization_id` (`description_localization_id`),
  KEY `dsp_localization_id` (`localization_id`),
  KEY `dsp_power_type` (`power_type`),
  KEY `dsp_icon` (`icon`),
  CONSTRAINT `dps_subtext_localization_id` FOREIGN KEY (`subtext_localization_id`) REFERENCES `data_localization` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `dsp_aura_localization_id` FOREIGN KEY (`aura_localization_id`) REFERENCES `data_localization` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `dsp_description_localization_id` FOREIGN KEY (`description_localization_id`) REFERENCES `data_localization` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `dsp_dispel_type` FOREIGN KEY (`dispel_type`) REFERENCES `data_spell_dispel_type` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `dsp_expansion_id` FOREIGN KEY (`expansion_id`) REFERENCES `data_expansion` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `dsp_icon` FOREIGN KEY (`icon`) REFERENCES `data_icon` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `dsp_localization_id` FOREIGN KEY (`localization_id`) REFERENCES `data_localization` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `dsp_power_type` FOREIGN KEY (`power_type`) REFERENCES `data_spell_power_type` (`id`) ON UPDATE CASCADE
  ) ENGINE=InnoDB AUTO_INCREMENT=301102 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `data_spell_dispel_type`
--

DROP TABLE IF EXISTS `data_spell_dispel_type`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `data_spell_dispel_type` (
                                        `id` tinyint(3) unsigned NOT NULL AUTO_INCREMENT,
  `localization_id` int(11) unsigned NOT NULL,
  `color` varchar(6) COLLATE utf8mb3_unicode_ci NOT NULL,
  PRIMARY KEY (`id`),
  KEY `dsdt_localization_id` (`localization_id`),
  CONSTRAINT `dsdt_localization_id` FOREIGN KEY (`localization_id`) REFERENCES `data_localization` (`id`) ON UPDATE CASCADE
  ) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `data_spell_effect`
--

DROP TABLE IF EXISTS `data_spell_effect`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `data_spell_effect` (
                                   `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `expansion_id` tinyint(3) unsigned NOT NULL,
  `spell_id` int(11) unsigned NOT NULL,
  `points_lower` int(11) NOT NULL,
  `points_upper` int(11) NOT NULL,
  `chain_targets` smallint(5) unsigned NOT NULL,
  `radius` int(11) unsigned NOT NULL,
  PRIMARY KEY (`id`),
  KEY `id` (`spell_id`),
  KEY `dse_spell_id` (`expansion_id`,`spell_id`),
  CONSTRAINT `dse_expansion_id` FOREIGN KEY (`expansion_id`) REFERENCES `data_expansion` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
  ) ENGINE=InnoDB AUTO_INCREMENT=129789 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `data_spell_power_type`
--

DROP TABLE IF EXISTS `data_spell_power_type`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `data_spell_power_type` (
                                       `id` tinyint(3) unsigned NOT NULL AUTO_INCREMENT,
  `localization_id` int(11) unsigned NOT NULL,
  `color` varchar(6) COLLATE utf8mb3_unicode_ci NOT NULL,
  PRIMARY KEY (`id`),
  KEY `dspt_localization_id` (`localization_id`),
  CONSTRAINT `dspt_localization_id` FOREIGN KEY (`localization_id`) REFERENCES `data_localization` (`id`) ON UPDATE CASCADE
  ) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `data_stat_type`
--

DROP TABLE IF EXISTS `data_stat_type`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `data_stat_type` (
                                `id` tinyint(3) unsigned NOT NULL AUTO_INCREMENT,
  `localization_id` int(11) unsigned NOT NULL,
  PRIMARY KEY (`id`),
  KEY `dst_localization_id` (`localization_id`),
  CONSTRAINT `dst_localization_id` FOREIGN KEY (`localization_id`) REFERENCES `data_localization` (`id`) ON UPDATE CASCADE
  ) ENGINE=InnoDB AUTO_INCREMENT=45 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `data_title`
--

DROP TABLE IF EXISTS `data_title`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `data_title` (
                            `id` smallint(5) unsigned NOT NULL AUTO_INCREMENT,
  `localization_id` int(11) unsigned NOT NULL,
  PRIMARY KEY (`id`)
  ) ENGINE=InnoDB AUTO_INCREMENT=673 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `instance_attempt`
--

DROP TABLE IF EXISTS `instance_attempt`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `instance_attempt` (
                                  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `instance_meta_id` int(11) unsigned NOT NULL,
  `encounter_id` int(11) unsigned NOT NULL,
  `start_ts` bigint(20) unsigned NOT NULL,
  `end_ts` bigint(20) unsigned NOT NULL,
  `is_kill` tinyint(1) NOT NULL,
  `rankable` tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  KEY `ia2_instance_meta_id` (`instance_meta_id`),
  KEY `ia2_encounter_id` (`encounter_id`),
  CONSTRAINT `ia2_encounter_id` FOREIGN KEY (`encounter_id`) REFERENCES `data_encounter` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `ia2_instance_meta_id` FOREIGN KEY (`instance_meta_id`) REFERENCES `instance_meta` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `instance_battleground`
--

DROP TABLE IF EXISTS `instance_battleground`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `instance_battleground` (
                                       `instance_meta_id` int(11) unsigned NOT NULL,
  `winner` tinyint(1) unsigned DEFAULT NULL,
  `score_alliance` int(11) unsigned DEFAULT NULL,
  `score_horde` int(11) unsigned DEFAULT NULL,
  PRIMARY KEY (`instance_meta_id`),
  CONSTRAINT `ib_instance_meta_id` FOREIGN KEY (`instance_meta_id`) REFERENCES `instance_meta` (`id`) ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `instance_loot`
--

DROP TABLE IF EXISTS `instance_loot`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `instance_loot` (
                               `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `instance_meta_id` int(11) unsigned NOT NULL,
  `character_id` int(11) unsigned NOT NULL,
  `item_id` int(11) unsigned NOT NULL,
  `looted_ts` bigint(20) unsigned NOT NULL,
  `amount` int(11) unsigned NOT NULL,
  PRIMARY KEY (`id`),
  KEY `il_instance_meta_id` (`instance_meta_id`),
  KEY `il_character_id` (`character_id`),
  KEY `il_item_id` (`item_id`),
  CONSTRAINT `il_character_id` FOREIGN KEY (`character_id`) REFERENCES `armory_character` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `il_instance_meta_id` FOREIGN KEY (`instance_meta_id`) REFERENCES `instance_meta` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `il_item_id` FOREIGN KEY (`item_id`) REFERENCES `data_item` (`id`) ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `instance_meta`
--

DROP TABLE IF EXISTS `instance_meta`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `instance_meta` (
                               `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `server_id` int(11) unsigned NOT NULL,
  `start_ts` bigint(20) unsigned NOT NULL,
  `end_ts` bigint(20) unsigned DEFAULT NULL,
  `expired` bigint(20) unsigned DEFAULT NULL COMMENT 'TS when instance expired',
  `instance_id` int(11) unsigned NOT NULL,
  `map_id` smallint(6) unsigned NOT NULL,
  `last_event_id` int(11) unsigned NOT NULL DEFAULT 1,
  `upload_id` int(11) unsigned NOT NULL DEFAULT 1,
  `privacy_type` tinyint(1) unsigned NOT NULL DEFAULT 0,
  `privacy_ref` int(11) unsigned NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `im_lookup` (`server_id`,`expired`,`instance_id`,`map_id`),
  KEY `im_upload_id` (`upload_id`),
  CONSTRAINT `im_server_id` FOREIGN KEY (`server_id`) REFERENCES `data_server` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `im_upload_id` FOREIGN KEY (`upload_id`) REFERENCES `instance_uploads` (`id`) ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `instance_participants`
--

DROP TABLE IF EXISTS `instance_participants`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `instance_participants` (
                                       `instance_meta_id` int(11) unsigned NOT NULL,
  `character_id` int(11) unsigned NOT NULL,
  PRIMARY KEY (`instance_meta_id`,`character_id`),
  KEY `ip_character_id` (`character_id`),
  CONSTRAINT `ip_character_id` FOREIGN KEY (`character_id`) REFERENCES `armory_character` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `ip_instance_meta_id` FOREIGN KEY (`instance_meta_id`) REFERENCES `instance_meta` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `instance_raid`
--

DROP TABLE IF EXISTS `instance_raid`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `instance_raid` (
                               `instance_meta_id` int(11) unsigned NOT NULL,
  `map_difficulty` tinyint(1) unsigned NOT NULL,
  PRIMARY KEY (`instance_meta_id`),
  CONSTRAINT `ir_instance_meta_id` FOREIGN KEY (`instance_meta_id`) REFERENCES `instance_meta` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `instance_ranking_damage`
--

DROP TABLE IF EXISTS `instance_ranking_damage`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `instance_ranking_damage` (
                                         `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `character_id` int(11) unsigned NOT NULL,
  `attempt_id` int(11) unsigned NOT NULL,
  `damage` int(11) unsigned NOT NULL,
  PRIMARY KEY (`id`),
  KEY `ird_character_id` (`character_id`),
  KEY `ird_attempt_id` (`attempt_id`),
  CONSTRAINT `ird_attempt_id` FOREIGN KEY (`attempt_id`) REFERENCES `instance_attempt` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `ird_character_id` FOREIGN KEY (`character_id`) REFERENCES `armory_character` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `instance_ranking_heal`
--

DROP TABLE IF EXISTS `instance_ranking_heal`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `instance_ranking_heal` (
                                       `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `character_id` int(11) unsigned NOT NULL,
  `attempt_id` int(11) unsigned NOT NULL,
  `heal` int(11) unsigned NOT NULL,
  PRIMARY KEY (`id`),
  KEY `irh_character_id` (`character_id`),
  KEY `irh_attempt_id` (`attempt_id`),
  CONSTRAINT `irh_attempt_id` FOREIGN KEY (`attempt_id`) REFERENCES `instance_attempt` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `irh_character_id` FOREIGN KEY (`character_id`) REFERENCES `armory_character` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `instance_ranking_threat`
--

DROP TABLE IF EXISTS `instance_ranking_threat`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `instance_ranking_threat` (
                                         `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `character_id` int(11) unsigned NOT NULL,
  `attempt_id` int(11) unsigned NOT NULL,
  `threat` int(11) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `irt_character_id` (`character_id`),
  KEY `irt_attempt_id` (`attempt_id`),
  CONSTRAINT `irt_attempt_id` FOREIGN KEY (`attempt_id`) REFERENCES `instance_attempt` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `irt_character_id` FOREIGN KEY (`character_id`) REFERENCES `armory_character` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `instance_rated_arena`
--

DROP TABLE IF EXISTS `instance_rated_arena`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `instance_rated_arena` (
                                      `instance_meta_id` int(11) unsigned NOT NULL,
  `team_id1` int(11) unsigned NOT NULL,
  `team_id2` int(11) unsigned NOT NULL,
  `winner` tinyint(1) unsigned DEFAULT NULL,
  `team_change1` int(11) DEFAULT NULL,
  `team_change2` int(11) DEFAULT NULL,
  PRIMARY KEY (`instance_meta_id`),
  KEY `ia_team_id1` (`team_id1`),
  KEY `ia_team_id2` (`team_id2`),
  CONSTRAINT `ia_instance_meta_id` FOREIGN KEY (`instance_meta_id`) REFERENCES `instance_meta` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `ia_team_id1` FOREIGN KEY (`team_id1`) REFERENCES `armory_arena_team` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `ia_team_id2` FOREIGN KEY (`team_id2`) REFERENCES `armory_arena_team` (`id`) ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `instance_skirmish`
--

DROP TABLE IF EXISTS `instance_skirmish`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `instance_skirmish` (
                                   `instance_meta_id` int(11) unsigned NOT NULL,
  `winner` tinyint(1) unsigned DEFAULT NULL,
  PRIMARY KEY (`instance_meta_id`),
  CONSTRAINT `is_instance_meta_id` FOREIGN KEY (`instance_meta_id`) REFERENCES `instance_meta` (`id`) ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `instance_uploads`
--

DROP TABLE IF EXISTS `instance_uploads`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `instance_uploads` (
                                  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `member_id` int(11) unsigned NOT NULL,
  `timestamp` bigint(20) unsigned NOT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_upload_member_id` (`member_id`),
  CONSTRAINT `fk_upload_member_id` FOREIGN KEY (`member_id`) REFERENCES `account_member` (`id`) ON DELETE NO ACTION ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `utility_addon_paste`
--

DROP TABLE IF EXISTS `utility_addon_paste`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `utility_addon_paste` (
                                     `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `title` varchar(256) COLLATE utf8mb3_unicode_ci NOT NULL,
  `expansion_id` tinyint(3) unsigned NOT NULL,
  `addon_name` varchar(256) COLLATE utf8mb3_unicode_ci NOT NULL,
  `tags` varchar(1024) COLLATE utf8mb3_unicode_ci NOT NULL COMMENT 'Comma separated ids',
  `description` text COLLATE utf8mb3_unicode_ci NOT NULL,
  `content` mediumtext COLLATE utf8mb3_unicode_ci NOT NULL,
  `member_id` int(11) unsigned NOT NULL,
  PRIMARY KEY (`id`),
  KEY `uap_expansion_id` (`expansion_id`),
  KEY `uap_member_id` (`member_id`),
  CONSTRAINT `uap_expansion_id` FOREIGN KEY (`expansion_id`) REFERENCES `data_expansion` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `uap_member_id` FOREIGN KEY (`member_id`) REFERENCES `account_member` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `utility_tiny_url`
--

DROP TABLE IF EXISTS `utility_tiny_url`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `utility_tiny_url` (
                                  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `url_payload` text COLLATE utf8mb3_unicode_ci NOT NULL,
  PRIMARY KEY (`id`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2025-11-11 16:07:01