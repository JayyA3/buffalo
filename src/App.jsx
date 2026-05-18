import { useState, useEffect, useRef, useCallback } from "react";

export default function App() {
  const [habits, setHabits] = useState(() => {
    const stored = localStorage.getItem("habitTracker_habits_v1");
    return stored ? JSON.parse(stored) : [];
  });

  const [completions, setCompletions] = useState(() => {
    const stored = localStorage.getItem("habitTracker_completions_v1");
    return stored ? JSON.parse(stored) : {};
  });

  const [showAddModal, setShowAddModal] = useState(false);
  const [newHabitName, setNewHabitName] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split("T")[0]
  );

  useEffect(() => {
    localStorage.setItem("habitTracker_habits_v1", JSON.stringify(habits));
  }, [habits]);

  useEffect(() => {
    localStorage.setItem(
      "habitTracker_completions_v1",
      JSON.stringify(completions)
    );
  }, [completions]);

  const PRESET_COLORS = [
    "#10b981",
    "#3b82f6",
    "#8b5cf6",
    "#ef4444",
    "#f59e0b",
    "#ec4899",
    "#06b6d4",
    "#84cc16",
  ];

  const addHabit = () => {
    if (!newHabitName.trim()) return;
    const newHabit = {
      id: `habit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: newHabitName.trim(),
      color: PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)],
      createdAt: Date.now(),
    };
    setHabits([...habits, newHabit]);
    setNewHabitName("");
    setShowAddModal(false);
  };

  const deleteHabit = (habitId) => {
    setHabits(habits.filter((h) => h.id !== habitId));
    const newCompletions = { ...completions };
    Object.keys(newCompletions).forEach((key) => {
      if (key.startsWith(habitId + "-")) {
        delete newCompletions[key];
      }
    });
    setCompletions(newCompletions);
    setDeleteConfirm(null);
  };

  const toggleCompletion = (habitId, date) => {
    const key = `${habitId}-${date}`;
    const newCompletions = { ...completions };
    if (newCompletions[key]) {
      delete newCompletions[key];
    } else {
      newCompletions[key] = {
        timestamp: Date.now(),
      };
    }
    setCompletions(newCompletions);
  };

  const calculateStreak = useCallback(
    (habitId) => {
      let streak = 0;
      const today = new Date();
      let checkDate = new Date(today);

      while (true) {
        const dateStr = checkDate.toISOString().split("T")[0];
        const key = `${habitId}-${dateStr}`;
        if (completions[key]) {
          streak++;
          checkDate.setDate(checkDate.getDate() - 1);
        } else {
          break;
        }
      }
      return streak;
    },
    [completions]
  );

  const getDatesForHeatmap = () => {
    const dates = [];
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 89);

    for (
      let d = new Date(startDate);
      d <= endDate;
      d.setDate(d.getDate() + 1)
    ) {
      dates.push(d.toISOString().split("T")[0]);
    }
    return dates;
  };

  const getCompletionIntensity = (date) => {
    if (habits.length === 0) return 0;
    const completed = habits.filter((h) => {
      const key = `${h.id}-${date}`;
      return completions[key];
    }).length;
    const percentage = completed / habits.length;
    if (percentage === 0) return 0;
    if (percentage <= 0.25) return 1;
    if (percentage <= 0.5) return 2;
    if (percentage <= 0.75) return 3;
    return 4;
  };

  const heatmapDates = getDatesForHeatmap();

  const todayHabits = habits
    .map((habit) => ({
      ...habit,
      isCompletedToday: !!completions[`${habit.id}-${selectedDate}`],
      currentStreak: calculateStreak(habit.id),
    }))
    .sort((a, b) => {
      if (a.isCompletedToday !== b.isCompletedToday) {
        return a.isCompletedToday ? 1 : -1;
      }
      return a.createdAt - b.createdAt;
    });

  const styles = {
    app: {
      minHeight: "100vh",
      backgroundColor: "#0f172a",
      color: "#f1f5f9",
      fontFamily:
        "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    },
    container: {
      maxWidth: "1200px",
      margin: "0 auto",
      padding: "24px 16px",
    },
    header: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: "32px",
      flexWrap: "wrap",
      gap: "16px",
    },
    title: {
      fontSize: "32px",
      fontWeight: "700",
      margin: "0",
      color: "#f1f5f9",
      letterSpacing: "-0.02em",
    },
    addButton: {
      padding: "12px 24px",
      backgroundColor: "#6366f1",
      color: "#fff",
      border: "none",
      borderRadius: "8px",
      fontSize: "16px",
      fontWeight: "500",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      gap: "8px",
      transition: "all 0.2s",
      boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.3)",
    },
    addButtonHover: {
      backgroundColor: "#4f46e5",
      transform: "translateY(-1px)",
      boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.3)",
    },
    content: {
      display: "grid",
      gridTemplateColumns: "1fr",
      gap: "24px",
    },
    section: {
      backgroundColor: "#1e293b",
      borderRadius: "12px",
      padding: "24px",
      boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.3)",
    },
    sectionTitle: {
      fontSize: "20px",
      fontWeight: "600",
      margin: "0 0 20px 0",
      color: "#f1f5f9",
    },
    habitCard: {
      padding: "16px",
      borderRadius: "8px",
      border: "1px solid #334155",
      marginBottom: "12px",
      backgroundColor: "#1e293b",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      transition: "all 0.2s",
    },
    habitCardHover: {
      borderColor: "#6366f1",
      boxShadow: "0 1px 2px 0 rgba(0, 0, 0, 0.3)",
    },
    habitLeft: {
      display: "flex",
      alignItems: "center",
      gap: "12px",
      flex: 1,
    },
    checkbox: {
      width: "24px",
      height: "24px",
      borderRadius: "6px",
      border: "2px solid #94a3b8",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      transition: "all 0.2s",
      flexShrink: 0,
    },
    checkboxChecked: {
      backgroundColor: "#10b981",
      borderColor: "#10b981",
    },
    habitName: {
      fontSize: "16px",
      fontWeight: "500",
      color: "#f1f5f9",
    },
    habitRight: {
      display: "flex",
      alignItems: "center",
      gap: "16px",
    },
    streakBadge: {
      padding: "6px 12px",
      borderRadius: "9999px",
      fontSize: "14px",
      fontWeight: "600",
      display: "flex",
      alignItems: "center",
      gap: "4px",
    },
    deleteButton: {
      width: "32px",
      height: "32px",
      backgroundColor: "transparent",
      border: "1px solid #334155",
      borderRadius: "6px",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "#94a3b8",
      transition: "all 0.2s",
      flexShrink: 0,
    },
    deleteButtonHover: {
      backgroundColor: "#fee2e2",
      borderColor: "#ef4444",
      color: "#ef4444",
    },
    emptyState: {
      textAlign: "center",
      padding: "64px 24px",
      color: "#94a3b8",
    },
    emptyIcon: {
      fontSize: "64px",
      marginBottom: "16px",
    },
    emptyTitle: {
      fontSize: "20px",
      fontWeight: "600",
      color: "#cbd5e1",
      marginBottom: "8px",
    },
    emptyText: {
      fontSize: "14px",
      color: "#94a3b8",
    },
    modal: {
      position: "fixed",
      inset: "0",
      backgroundColor: "rgba(0, 0, 0, 0.7)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 1000,
      padding: "16px",
      backdropFilter: "blur(4px)",
    },
    modalContent: {
      backgroundColor: "#1e293b",
      borderRadius: "16px",
      padding: "32px",
      width: "100%",
      maxWidth: "480px",
      boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5)",
    },
    modalHeader: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: "24px",
    },
    modalTitle: {
      fontSize: "24px",
      fontWeight: "600",
      margin: "0",
      color: "#f1f5f9",
    },
    closeButton: {
      width: "32px",
      height: "32px",
      backgroundColor: "transparent",
      border: "none",
      borderRadius: "6px",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "#94a3b8",
      fontSize: "20px",
      transition: "all 0.2s",
    },
    closeButtonHover: {
      backgroundColor: "#334155",
      color: "#f1f5f9",
    },
    input: {
      width: "100%",
      height: "48px",
      padding: "12px 16px",
      border: "2px solid #334155",
      borderRadius: "8px",
      fontSize: "16px",
      color: "#f1f5f9",
      backgroundColor: "#0f172a",
      outline: "none",
      transition: "all 0.2s",
      boxSizing: "border-box",
    },
    inputFocus: {
      borderColor: "#6366f1",
      boxShadow: "0 0 0 3px rgba(99, 102, 241, 0.1)",
    },
    label: {
      display: "block",
      fontSize: "14px",
      fontWeight: "500",
      color: "#cbd5e1",
      marginBottom: "8px",
    },
    modalButtons: {
      marginTop: "32px",
      display: "flex",
      justifyContent: "flex-end",
      gap: "12px",
    },
    cancelButton: {
      padding: "10px 20px",
      backgroundColor: "transparent",
      border: "1px solid #334155",
      borderRadius: "8px",
      fontSize: "14px",
      fontWeight: "500",
      color: "#94a3b8",
      cursor: "pointer",
      transition: "all 0.2s",
    },
    cancelButtonHover: {
      backgroundColor: "#334155",
      borderColor: "#475569",
    },
    saveButton: {
      padding: "10px 24px",
      backgroundColor: "#6366f1",
      border: "none",
      borderRadius: "8px",
      fontSize: "14px",
      fontWeight: "500",
      color: "#fff",
      cursor: "pointer",
      transition: "all 0.2s",
    },
    saveButtonHover: {
      backgroundColor: "#4f46e5",
    },
    saveButtonDisabled: {
      backgroundColor: "#334155",
      color: "#64748b",
      cursor: "not-allowed",
    },
    heatmapContainer: {
      overflowX: "auto",
      paddingBottom: "16px",
    },
    heatmapGrid: {
      display: "inline-grid",
      gridTemplateColumns: "repeat(13, 1fr)",
      gap: "3px",
      minWidth: "fit-content",
    },
    heatmapCell: {
      width: "14px",
      height: "14px",
      borderRadius: "2px",
      transition: "all 0.2s",
      cursor: "pointer",
    },
    heatmapLegend: {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      marginTop: "16px",
      fontSize: "11px",
      color: "#94a3b8",
    },
    legendSquare: {
      width: "10px",
      height: "10px",
      borderRadius: "2px",
    },
    tooltip: {
      position: "absolute",
      backgroundColor: "#0f172a",
      color: "#f1f5f9",
      padding: "6px 10px",
      borderRadius: "6px",
      fontSize: "12px",
      pointerEvents: "none",
      whiteSpace: "nowrap",
      boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0