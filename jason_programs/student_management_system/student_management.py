import tkinter as tk
from tkinter import messagebox, ttk
import sqlite3
import os

# Database setup
DB_PATH = "students.db" # Changed to local path for now to avoid OS permission issues during dev

def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS students (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            first_name TEXT NOT NULL,
            last_name TEXT NOT NULL,
            age INTEGER,
            course TEXT,
            email TEXT,
            phone TEXT
        )
    ''')
    conn.commit()
    conn.close()

class StudentManagementSystem:
    def __init__(self, root):
        self.root = root
        self.root.title("Student Management System")
        self.root.geometry("800x500")

        # UI Elements
        self.create_widgets()
        self.refresh_table()

    def create_widgets(self):
        # Input Frame
        frame = tk.Frame(self.root, padx=10, pady=10)
        frame.pack(side=tk.TOP, fill=tk.X)

        tk.Label(frame, text="First Name:").grid(row=0, column=0)
        self.entry_first = tk.Entry(frame)
        self.entry_first.grid(row=0, column=1)

        tk.Label(frame, text="Last Name:").grid(row=0, column=2)
        self.entry_last = tk.Entry(frame)
        self.entry_last.grid(row=0, column=3)

        tk.Label(frame, text="Age:").grid(row=1, column=0)
        self.entry_age = tk.Entry(frame)
        self.entry_age.grid(row=1, column=1)

        tk.Label(frame, text="Course:").grid(row=1, column=2)
        self.entry_course = tk.Entry(frame)
        self.entry_course.grid(row=1, column=3)

        tk.Label(frame, text="Email:").grid(row=2, column=0)
        self.entry_email = tk.Entry(frame)
        self.entry_email.grid(row=2, column=1)

        tk.Label(frame, text="Phone:").grid(row=2, column=2)
        self.entry_phone = tk.Entry(frame)
        self.entry_phone.grid(row=2, column=3)

        # Buttons
        btn_frame = tk.Frame(self.root)
        btn_frame.pack(pady=10)

        tk.Button(btn_frame, text="Add Student", command=self.add_student).pack(side=tk.LEFT, padx=5)
        tk.Button(btn_frame, text="Delete Selected", command=self.delete_student).pack(side=tk.LEFT, padx=5)

        # Treeview
        self.tree = ttk.Treeview(self.root, columns=("ID", "First", "Last", "Age", "Course", "Email", "Phone"), show="headings")
        for col in ("ID", "First", "Last", "Age", "Course", "Email", "Phone"):
            self.tree.heading(col, text=col)
            self.tree.column(col, width=100)
        self.tree.pack(fill=tk.BOTH, expand=True)

    def add_student(self):
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        try:
            cursor.execute("INSERT INTO students (first_name, last_name, age, course, email, phone) VALUES (?, ?, ?, ?, ?, ?)",
                           (self.entry_first.get(), self.entry_last.get(), self.entry_age.get(), self.entry_course.get(), self.entry_email.get(), self.entry_phone.get()))
            conn.commit()
            messagebox.showinfo("Success", "Student added!")
            self.refresh_table()
        except Exception as e:
            messagebox.showerror("Error", str(e))
        finally:
            conn.close()

    def delete_student(self):
        selected = self.tree.selection()
        if not selected:
            return
        item = self.tree.item(selected[0])
        student_id = item['values'][0]
        
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("DELETE FROM students WHERE id = ?", (student_id,))
        conn.commit()
        conn.close()
        self.refresh_table()

    def refresh_table(self):
        for i in self.tree.get_children():
            self.tree.delete(i)
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM students")
        for row in cursor.fetchall():
            self.tree.insert("", tk.END, values=row)
        conn.close()

if __name__ == "__main__":
    init_db()
    root = tk.Tk()
    app = StudentManagementSystem(root)
    root.mainloop()
