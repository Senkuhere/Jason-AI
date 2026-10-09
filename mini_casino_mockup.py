import random
import tkinter as tk
from tkinter import messagebox


class MiniCasinoApp:

  def __init__(self, root):
    self.root = root
    self.root.title("Mini Casino")
    self.root.geometry("450x550")
    self.root.configure(bg="#1a1a1a")

    self.balance = 100

    # Title / Balance Header
    self.header_frame = tk.Frame(root, bg="#1a1a1a")
    self.header_frame.pack(fill=tk.X, pady=10)

    self.title_label = tk.Label(
        self.header_frame,
        text="♠️ MINI CASINO 🎰",
        font=("Arial", 18, "bold"),
        fg="#ffd700",
        bg="#1a1a1a",
    )
    self.title_label.pack()

    self.balance_label = tk.Label(
        self.header_frame,
        text=f"Balance: ${self.balance}",
        font=("Arial", 14, "bold"),
        fg="#00ff00",
        bg="#1a1a1a",
    )
    self.balance_label.pack(pady=5)

    # Navigation / Game Select Frame
    self.nav_frame = tk.Frame(root, bg="#1a1a1a")
    self.nav_frame.pack(pady=5)

    btn_style = {
        "font": ("Arial", 10, "bold"),
        "bg": "#333333",
        "fg": "white",
        "bd": 0,
        "padx": 10,
        "pady": 5,
    }

    tk.Button(
        self.nav_frame,
        text="Dice Roll",
        command=lambda: self.show_game("dice"),
        **btn_style,
    ).pack(side=tk.LEFT, padx=5)
    tk.Button(
        self.nav_frame,
        text="Coin Flip",
        command=lambda: self.show_game("coin"),
        **btn_style,
    ).pack(side=tk.LEFT, padx=5)
    tk.Button(
        self.nav_frame,
        text="Slots",
        command=lambda: self.show_game("slots"),
        **btn_style,
    ).pack(side=tk.LEFT, padx=5)

    # Container for game frames
    self.container = tk.Frame(root, bg="#262626", bd=2, relief=tk.GROOVE)
    self.container.pack(fill=tk.BOTH, expand=True, padx=20, pady=15)

    # Initialize game frames
    self.dice_frame = tk.Frame(self.container, bg="#262626")
    self.coin_frame = tk.Frame(self.container, bg="#262626")
    self.slots_frame = tk.Frame(self.container, bg="#262626")

    self.setup_dice_game()
    self.setup_coin_game()
    self.setup_slots_game()

    self.show_game("dice")

  def update_balance(self, amount):
    self.balance += amount
    self.balance_label.config(text=f"Balance: ${self.balance}")
    if self.balance <= 0:
      messagebox.showinfo(
          "Game Over", "You're out of cash! Resetting to $100."
      )
      self.balance = 100
      self.balance_label.config(text=f"Balance: ${self.balance}")

  def show_game(self, game_name):
    for frame in (self.dice_frame, self.coin_frame, self.slots_frame):
      frame.pack_forget()

    if game_name == "dice":
      self.dice_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)
    elif game_name == "coin":
      self.coin_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)
    elif game_name == "slots":
      self.slots_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)

  # --- 1. DICE GAME ---
  def setup_dice_game(self):
    tk.Label(
        self.dice_frame,
        text="🎲 High Roll Dice",
        font=("Arial", 14, "bold"),
        fg="white",
        bg="#262626",
    ).pack(pady=10)
    tk.Label(
        self.dice_frame,
        text="Roll higher than 3 to win ($10 bet)",
        font=("Arial", 10),
        fg="#bbbbbb",
        bg="#262626",
    ).pack()

    self.dice_result_label = tk.Label(
        self.dice_frame,
        text="[ ? ]",
        font=("Arial", 32, "bold"),
        fg="#ffd700",
        bg="#262626",
    )
    self.dice_result_label.pack(pady=20)

    tk.Button(
        self.dice_frame,
        text="Roll Dice",
        command=self.play_dice,
        font=("Arial", 12, "bold"),
        bg="#4CAF50",
        fg="white",
        padx=15,
        pady=5,
    ).pack(pady=10)

  def play_dice(self):
    if self.balance < 10:
      messagebox.showwarning("Low Balance", "Need at least $10!")
      return

    self.update_balance(-10)
    roll = random.randint(1, 6)
    self.dice_result_label.config(text=str(roll))

    if roll > 3:
      self.update_balance(20)
      messagebox.showinfo("Winner!", f"You rolled a {roll}! You won $20.")
    else:
      messagebox.showinfo("Loss", f"You rolled a {roll}. Better luck next time!")

  # --- 2. COIN FLIP GAME ---
  def setup_coin_game(self):
    tk.Label(
        self.coin_frame,
        text="🪙 Coin Flip",
        font=("Arial", 14, "bold"),
        fg="white",
        bg="#262626",
    ).pack(pady=10)
    tk.Label(
        self.coin_frame,
        text="Guess Heads or Tails ($10 bet)",
        font=("Arial", 10),
        fg="#bbbbbb",
        bg="#262626",
    ).pack()

    self.coin_result_label = tk.Label(
        self.coin_frame,
        text="[ 🪙 ? ]",
        font=("Arial", 18, "bold"),
        fg="#ffd700",
        bg="#262626",
    )
    self.coin_result_label.pack(pady=20)

    btn_box = tk.Frame(self.coin_frame, bg="#262626")
    btn_box.pack(pady=10)

    tk.Button(
        btn_box,
        text="Heads",
        command=lambda: self.play_coin("Heads"),
        font=("Arial", 11, "bold"),
        bg="#2196F3",
        fg="white",
        width=8,
        pady=5,
    ).pack(side=tk.LEFT, padx=10)
    tk.Button(
        btn_box,
        text="Tails",
        command=lambda: self.play_coin("Tails"),
        font=("Arial", 11, "bold"),
        bg="#E91E63",
        fg="white",
        width=8,
        pady=5,
    ).pack(side=tk.LEFT, padx=10)

  def play_coin(self, choice):
    if self.balance < 10:
      messagebox.showwarning("Low Balance", "Need at least $10!")
      return

    self.update_balance(-10)
    actual = random.choice(["Heads", "Tails"])
    icon = "👑" if actual == "Heads" else "🦅"

    self.coin_result_label.config(text=f"{icon} {actual}!")

    if choice == actual:
      self.update_balance(20)
      messagebox.showinfo("Winner!", f"It was {actual}! You won $20.")
    else:
      messagebox.showinfo("Loss", f"It was {actual}. You guessed {choice}.")

  # --- 3. SLOT MACHINE GAME ---
  def setup_slots_game(self):
    tk.Label(
        self.slots_frame,
        text="🎰 Lucky Slots",
        font=("Arial", 14, "bold"),
        fg="white",
        bg="#262626",
    ).pack(pady=10)
    tk.Label(
        self.slots_frame,
        text="Match 3 symbols to win! ($15 bet)",
        font=("Arial", 10),
        fg="#bbbbbb",
        bg="#262626",
    ).pack()

    self.slot_display = tk.Label(
        self.slots_frame,
        text="🍒 | 🍋 | 🔔",
        font=("Arial", 22, "bold"),
        fg="#ffd700",
        bg="#111111",
        padx=20,
        pady=10,
    )
    self.slot_display.pack(pady=20)

    tk.Button(
        self.slots_frame,
        text="Spin Slots",
        command=self.play_slots,
        font=("Arial", 12, "bold"),
        bg="#FF9800",
        fg="white",
        padx=15,
        pady=5,
    ).pack(pady=10)

  def play_slots(self):
    if self.balance < 15:
      messagebox.showwarning("Low Balance", "Need at least $15!")
      return

    self.update_balance(-15)
    symbols = ["🍒", "🍋", "🔔", "⭐", "💎"]
    spin = [random.choice(symbols) for _ in range(3)]

    self.slot_display.config(text=f" {spin[0]} | {spin[1]} | {spin[2]} ")

    if spin[0] == spin[1] == spin[2]:
      self.update_balance(100)
      messagebox.showinfo("JACKPOT! 🎉", f"Triple {spin[0]}! You won $100!")
    elif spin[0] == spin[1] or spin[1] == spin[2] or spin[0] == spin[2]:
      self.update_balance(30)
      messagebox.showinfo("Nice! ✨", "Two matching symbols! You won $30.")
    else:
      messagebox.showinfo("Loss", "No match. Try again!")


if __name__ == "__main__":
  root = tk.Tk()
  app = MiniCasinoApp(root)
  root.mainloop()
