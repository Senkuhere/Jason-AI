import tkinter as tk
from tkinter import ttk, messagebox
from datetime import datetime

class Vehicle:
    def __init__(self, plate_number, owner_name, vehicle_type, slot_number):
        self.plate_number = plate_number.upper().strip()
        self.owner_name = owner_name.strip()
        self.vehicle_type = vehicle_type
        self.slot_number = slot_number
        self.entry_time = datetime.now()

    def get_duration_hours(self):
        duration = datetime.now() - self.entry_time
        hours = duration.total_seconds() / 3600
        return max(1, round(hours, 2))  # Minimum 1 hour billing

    def calculate_fee(self):
        rates = {"Car": 50, "SUV/Van": 70, "Motorcycle": 20, "Truck": 100}
        rate = rates.get(self.vehicle_type, 50)
        return round(self.get_duration_hours() * rate, 2)


class ParkingManager:
    def __init__(self):
        self.vehicles = {}  # plate_number -> Vehicle object
        self.total_slots = 12

    def create_vehicle(self, plate, owner, v_type, slot):
        if not plate or not owner:
            raise ValueError("Plate number and Owner name cannot be empty.")
        if plate in self.vehicles:
            raise ValueError(f"Vehicle with plate '{plate}' is already parked.")
        
        # Check if slot is taken
        for v in self.vehicles.values():
            if v.slot_number == slot:
                raise ValueError(f"Slot {slot} is already occupied.")

        vehicle = Vehicle(plate, owner, v_type, slot)
        self.vehicles[plate] = vehicle
        return vehicle

    def read_vehicles(self):
        return list(self.vehicles.values())

    def update_vehicle(self, plate, new_owner, new_type, new_slot):
        if plate not in self.vehicles:
            raise ValueError(f"Vehicle '{plate}' not found.")
        
        # Check slot conflict if slot changed
        vehicle = self.vehicles[plate]
        if vehicle.slot_number != new_slot:
            for v in self.vehicles.values():
                if v.slot_number == new_slot and v.plate_number != plate:
                    raise ValueError(f"Slot {new_slot} is already occupied.")

        vehicle.owner_name = new_owner.strip()
        vehicle.vehicle_type = new_type
        vehicle.slot_number = new_slot
        return vehicle

    def delete_vehicle(self, plate):
        if plate not in self.vehicles:
            raise ValueError(f"Vehicle '{plate}' not found.")
        return self.vehicles.pop(plate)


class ParkingApp:
    def __init__(self, root):
        self.root = root
        self.root.title("SmartPark - Vehicle Parking Management System")
        self.root.geometry("1000x650")
        self.root.configure(bg="#0f172a")

        self.manager = ParkingManager()

        # Styles
        style = ttk.Style()
        style.theme_use("clam")
        style.configure("Treeview", 
                        background="#1e293b", 
                        foreground="#f8fafc", 
                        fieldbackground="#1e293b",
                        rowheight=28,
                        font=("Segoe UI", 10))
        style.configure("Treeview.Heading", 
                        background="#334155", 
                        foreground="#ffffff", 
                        font=("Segoe UI", 10, "bold"))
        style.map("Treeview", background=[('selected', '#3b82f6')])

        self.create_widgets()
        self.load_sample_data()

    def create_widgets(self):
        # Header Frame
        header_frame = tk.Frame(self.root, bg="#1e293b", height=70)
        header_frame.pack(fill=tk.X, padx=10, pady=10)
        header_frame.pack_propagate(False)

        title_label = tk.Label(header_frame, text="🚗 SmartPark Management System", font=("Segoe UI", 18, "bold"), fg="#38bdf8", bg="#1e293b")
        title_label.pack(side=tk.LEFT, padx=20)

        self.status_label = tk.Label(header_frame, text="", font=("Segoe UI", 11), fg="#94a3b8", bg="#1e293b")
        self.status_label.pack(side=tk.RIGHT, padx=20)

        # Main Content Layout (Left: Form, Right: Table & Visual Slots)
        content_frame = tk.Frame(self.root, bg="#0f172a")
        content_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=5)

        # --- LEFT FRAME: CRUD Form ---
        form_frame = tk.LabelFrame(content_frame, text=" Vehicle & Slot Management ", font=("Segoe UI", 11, "bold"), fg="#f8fafc", bg="#1e293b", bd=2, relief=tk.GROOVE)
        form_frame.pack(side=tk.LEFT, fill=tk.Y, padx=5, pady=5, ipadx=10, ipady=10)

        # Plate Number
        tk.Label(form_frame, text="Plate Number:", font=("Segoe UI", 10), fg="#cbd5e1", bg="#1e293b").pack(anchor="w", padx=10, pady=(10, 2))
        self.plate_entry = tk.Entry(form_frame, font=("Segoe UI", 11), bg="#334155", fg="#ffffff", insertbackground="white")
        self.plate_entry.pack(fill=tk.X, padx=10, pady=2)

        # Owner Name
        tk.Label(form_frame, text="Owner Name:", font=("Segoe UI", 10), fg="#cbd5e1", bg="#1e293b").pack(anchor="w", padx=10, pady=(10, 2))
        self.owner_entry = tk.Entry(form_frame, font=("Segoe UI", 11), bg="#334155", fg="#ffffff", insertbackground="white")
        self.owner_entry.pack(fill=tk.X, padx=10, pady=2)

        # Vehicle Type
        tk.Label(form_frame, text="Vehicle Type:", font=("Segoe UI", 10), fg="#cbd5e1", bg="#1e293b").pack(anchor="w", padx=10, pady=(10, 2))
        self.type_combo = ttk.Combobox(form_frame, values=["Car", "SUV/Van", "Motorcycle", "Truck"], font=("Segoe UI", 11), state="readonly")
        self.type_combo.pack(fill=tk.X, padx=10, pady=2)
        self.type_combo.current(0)

        # Slot Number
        tk.Label(form_frame, text="Assigned Slot (1-12):", font=("Segoe UI", 10), fg="#cbd5e1", bg="#1e293b").pack(anchor="w", padx=10, pady=(10, 2))
        self.slot_spin = ttk.Spinbox(form_frame, from_=1, to=12, font=("Segoe UI", 11))
        self.slot_spin.pack(fill=tk.X, padx=10, pady=2)
        self.slot_spin.set(1)

        # Buttons Frame
        btn_frame = tk.Frame(form_frame, bg="#1e293b")
        btn_frame.pack(fill=tk.X, padx=10, pady=20)

        self.btn_park = tk.Button(btn_frame, text="Park Vehicle (Create)", command=self.park_vehicle, font=("Segoe UI", 10, "bold"), bg="#22c55e", fg="white", relief=tk.FLAT, cursor="hand2")
        self.btn_park.pack(fill=tk.X, pady=4)

        self.btn_update = tk.Button(btn_frame, text="Update Record", command=self.update_vehicle, font=("Segoe UI", 10, "bold"), bg="#3b82f6", fg="white", relief=tk.FLAT, cursor="hand2")
        self.btn_update.pack(fill=tk.X, pady=4)

        self.btn_checkout = tk.Button(btn_frame, text="Checkout & Bill (Delete)", command=self.checkout_vehicle, font=("Segoe UI", 10, "bold"), bg="#ef4444", fg="white", relief=tk.FLAT, cursor="hand2")
        self.btn_checkout.pack(fill=tk.X, pady=4)

        self.btn_clear = tk.Button(btn_frame, text="Clear Form", command=self.clear_form, font=("Segoe UI", 10), bg="#64748b", fg="white", relief=tk.FLAT, cursor="hand2")
        self.btn_clear.pack(fill=tk.X, pady=4)

        # --- RIGHT FRAME: Table & Parking Grid ---
        right_frame = tk.Frame(content_frame, bg="#0f172a")
        right_frame.pack(side=tk.RIGHT, fill=tk.BOTH, expand=True, padx=5, pady=5)

        # Treeview Table
        table_frame = tk.Frame(right_frame, bg="#1e293b")
        table_frame.pack(fill=tk.BOTH, expand=True, pady=(0, 10))

        columns = ("plate", "owner", "type", "slot", "entry", "fee")
        self.tree = ttk.Treeview(table_frame, columns=columns, show="headings", selectmode="browse")
        
        self.tree.heading("plate", text="Plate No.")
        self.tree.heading("owner", text="Owner")
        self.tree.heading("type", text="Type")
        self.tree.heading("slot", text="Slot")
        self.tree.heading("entry", text="Time In")
        self.tree.heading("fee", text="Est. Fee ($)")

        self.tree.column("plate", width=90, anchor="center")
        self.tree.column("owner", width=140, anchor="w")
        self.tree.column("type", width=90, anchor="center")
        self.tree.column("slot", width=50, anchor="center")
        self.tree.column("entry", width=130, anchor="center")
        self.tree.column("fee", width=80, anchor="center")

        scrollbar = ttk.Scrollbar(table_frame, orient=tk.VERTICAL, command=self.tree.yview)
        self.tree.configure(yscrollcommand=scrollbar.set)

        self.tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)

        self.tree.bind("<<TreeviewSelect>>", self.on_row_select)

        # Visual Parking Slots Frame
        slots_container = tk.LabelFrame(right_frame, text=" Parking Lot Status (Live Slots 1-12) ", font=("Segoe UI", 10, "bold"), fg="#f8fafc", bg="#1e293b", bd=2, relief=tk.GROOVE)
        slots_container.pack(fill=tk.X, ipady=5)

        self.slot_buttons = {}
        grid_frame = tk.Frame(slots_container, bg="#1e293b")
        grid_frame.pack(padx=10, pady=5)

        for i in range(1, 13):
            row = 0 if i <= 6 else 1
            col = (i - 1) % 6
            btn = tk.Button(grid_frame, text=f"Slot {i}\nAvailable", font=("Segoe UI", 9), width=12, height=2,
                            bg="#15803d", fg="white", relief=tk.RAISED,
                            command=lambda s=i: self.select_slot_from_grid(s))
            btn.grid(row=row, column=col, padx=4, pady=4)
            self.slot_buttons[i] = btn

        self.refresh_ui()

    def load_sample_data(self):
        try:
            self.manager.create_vehicle("ABC-1234", "John Doe", "Car", 1)
            self.manager.create_vehicle("XYZ-9876", "Alice Smith", "SUV/Van", 3)
            self.manager.create_vehicle("MTR-4421", "Bob Johnson", "Motorcycle", 5)
            self.refresh_ui()
        except Exception:
            pass

    def refresh_ui(self):
        # Clear table
        for item in self.tree.get_children():
            self.tree.delete(item)

        occupied_slots = {}
        for vehicle in self.manager.read_vehicles():
            occupied_slots[vehicle.slot_number] = vehicle
            self.tree.insert("", tk.END, values=(
                vehicle.plate_number,
                vehicle.owner_name,
                vehicle.vehicle_type,
                f"Slot {vehicle.slot_number}",
                vehicle.entry_time.strftime("%b %d, %H:%M"),
                f"${vehicle.calculate_fee():.2f}"
            ))

        # Update visual slot buttons
        for s in range(1, 13):
            btn = self.slot_buttons[s]
            if s in occupied_slots:
                v = occupied_slots[s]
                btn.config(text=f"Slot {s}\n{v.plate_number}", bg="#b91c1c", fg="#fca5a5")
            else:
                btn.config(text=f"Slot {s}\nAvailable", bg="#15803d", fg="#ffffff")

        # Update status header
        total_parked = len(self.manager.vehicles)
        available = self.manager.total_slots - total_parked
        self.status_label.config(text=f"Occupied: {total_parked}  |  Available: {available} / {self.manager.total_slots}")

    def park_vehicle(self):
        plate = self.plate_entry.get()
        owner = self.owner_entry.get()
        v_type = self.type_combo.get()
        try:
            slot = int(self.slot_spin.get())
            self.manager.create_vehicle(plate, owner, v_type, slot)
            self.refresh_ui()
            self.clear_form()
            messagebox.showinfo("Success", f"Vehicle '{plate.upper()}' parked successfully at Slot {slot}!")
        except ValueError as e:
            messagebox.showerror("Validation Error", str(e))

    def update_vehicle(self):
        selected = self.tree.selection()
        if not selected:
            messagebox.showwarning("Selection Warning", "Please select a vehicle from the table to update.")
            return

        item_values = self.tree.item(selected[0], "values")
        current_plate = item_values[0]

        new_owner = self.owner_entry.get()
        new_type = self.type_combo.get()
        try:
            new_slot = int(self.slot_spin.get())
            self.manager.update_vehicle(current_plate, new_owner, new_type, new_slot)
            self.refresh_ui()
            self.clear_form()
            messagebox.showinfo("Success", f"Vehicle '{current_plate}' updated successfully!")
        except ValueError as e:
            messagebox.showerror("Validation Error", str(e))

    def checkout_vehicle(self):
        selected = self.tree.selection()
        if not selected:
            messagebox.showwarning("Selection Warning", "Please select a vehicle from the table to checkout.")
            return

        item_values = self.tree.item(selected[0], "values")
        plate = item_values[0]
        
        vehicle = self.manager.vehicles.get(plate)
        if not vehicle:
            return

        fee = vehicle.calculate_fee()
        hours = vehicle.get_duration_hours()

        confirm = messagebox.askyesno("Confirm Checkout", 
                                      f"Checkout vehicle '{plate}'?\n\n"
                                      f"Owner: {vehicle.owner_name}\n"
                                      f"Duration: {hours} hours\n"
                                      f"Total Fee Due: ${fee:.2f}")
        if confirm:
            self.manager.delete_vehicle(plate)
            self.refresh_ui()
            self.clear_form()
            messagebox.showinfo("Receipt", f"Vehicle '{plate}' checked out successfully.\nCollected Fee: ${fee:.2f}")

    def on_row_select(self, event):
        selected = self.tree.selection()
        if not selected:
            return
        item_values = self.tree.item(selected[0], "values")
        plate = item_values[0]
        vehicle = self.manager.vehicles.get(plate)
        if vehicle:
            self.plate_entry.delete(0, tk.END)
            self.plate_entry.insert(0, vehicle.plate_number)
            
            self.owner_entry.delete(0, tk.END)
            self.owner_entry.insert(0, vehicle.owner_name)
            
            self.type_combo.set(vehicle.vehicle_type)
            self.slot_spin.set(vehicle.slot_number)

    def select_slot_from_grid(self, slot_num):
        self.slot_spin.set(slot_num)
        # Check if slot is occupied
        for v in self.manager.read_vehicles():
            if v.slot_number == slot_num:
                # Select in table
                for item in self.tree.get_children():
                    vals = self.tree.item(item, "values")
                    if vals[0] == v.plate_number:
                        self.tree.selection_set(item)
                        self.tree.see(item)
                        return
        # If available, clear plate for new entry
        self.plate_entry.delete(0, tk.END)
        self.owner_entry.delete(0, tk.END)
        self.tree.selection_remove(self.tree.selection())

    def clear_form(self):
        self.plate_entry.delete(0, tk.END)
        self.owner_entry.delete(0, tk.END)
        self.type_combo.current(0)
        self.slot_spin.set(1)
        if self.tree.selection():
            self.tree.selection_remove(self.tree.selection())


if __name__ == "__main__":
    root = tk.Tk()
    app = ParkingApp(root)
    root.mainloop()
