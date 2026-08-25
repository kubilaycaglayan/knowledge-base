package com.know.domain;
import jakarta.persistence.*;
@Entity @Table(name="item_tag") public class ItemTag { @EmbeddedId private ItemTagId id; protected ItemTag(){} public ItemTag(ItemTagId id){this.id=id;} }
