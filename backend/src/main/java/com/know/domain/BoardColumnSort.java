package com.know.domain;

import jakarta.persistence.*;
import java.io.Serializable;
import java.util.Objects;
import java.util.UUID;

/** A user's sort for one merged column of the All boards view, keyed by the normalized column name. */
@Entity
@Table(name = "board_column_sorts")
@IdClass(BoardColumnSort.Key.class)
public class BoardColumnSort {
  @Id @Column(name = "user_id") private UUID userId;
  @Id @Column(name = "column_key", length = 80) private String columnKey;
  @Enumerated(EnumType.STRING) @Column(name = "card_sort", nullable = false, length = 16) private BoardCardSort cardSort;

  protected BoardColumnSort() {}
  public BoardColumnSort(UUID userId, String columnKey, BoardCardSort cardSort) { this.userId = userId; this.columnKey = columnKey; this.cardSort = cardSort; }
  public UUID getUserId() { return userId; }
  public String getColumnKey() { return columnKey; }
  public BoardCardSort getCardSort() { return cardSort; }
  public void sortBy(BoardCardSort cardSort) { this.cardSort = cardSort; }

  public static class Key implements Serializable {
    private UUID userId;
    private String columnKey;
    public Key() {}
    public Key(UUID userId, String columnKey) { this.userId = userId; this.columnKey = columnKey; }
    @Override public boolean equals(Object other) { return other instanceof Key key && Objects.equals(userId, key.userId) && Objects.equals(columnKey, key.columnKey); }
    @Override public int hashCode() { return Objects.hash(userId, columnKey); }
  }
}
