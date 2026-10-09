# SmartPark - Python Tkinter Parking Management System

A desktop parking management application built in Python using **Tkinter**, featuring **Object-Oriented Programming (OOP)** and full **CRUD operations** (Create, Read, Update, Delete/Checkout).

---

## Features

1. **Object-Oriented Design (OOP)**:
   - **`Vehicle` Class**: Represents parked vehicles with attributes like plate number, owner name, vehicle type, entry timestamp, and dynamic fee calculation based on parking duration and vehicle rates.
   - **`ParkingManager` Class**: Handles business logic, validations, and storage dictionaries for active parked vehicles and slot allocations.
   - **`ParkingApp` Class**: Manages the Tkinter graphical user interface (GUI) layout, styling, event bindings, and user interactions.

2. **Full CRUD Operations**:
   - **Create (Park Vehicle)**: Assigns a plate number, owner, vehicle type, and available slot (1–12) with duplicate and occupancy validation.
   - **Read (Live Table & Grid)**: Displays all currently parked vehicles in a styled `ttk.Treeview` table and an interactive parking lot status grid.
   - **Update (Modify Record)**: Select any vehicle record to update owner details, vehicle type, or reassign parking slots.
   - **Delete (Checkout & Bill)**: Calculates total parking duration and fee upon checkout, removing the vehicle from active storage and freeing up the slot.

3. **Modern Dark UI Design**:
   - Built with a clean dark theme palette (`#0f172a` background, `#1e293b` cards, `#3b82f6` blue accents, `#22c55e` success green, and `#ef4444` danger red).
   - Interactive live parking lot visual grid (shows **Available** green slots or **Occupied** red slots with plate numbers).

---

## Prerequisites

- **Python 3.x** (Tkinter is included by default with standard Python installations on Windows, macOS, and Linux).

---

## How to Run

1. Open your terminal or command prompt.
2. Navigate to the project directory:
   ```bash
   cd parking-system
   ```
3. Run the application:
   ```bash
   python parking_app.py
   ```
