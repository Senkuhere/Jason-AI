import tkinter as tk
from tkinter import messagebox

class TicTacToe:
    def __init__(self, root):
        self.root = root
        self.root.title("Tic Tac Toe")
        self.turn = 'X'
        self.board = [""] * 9
        self.buttons = []

        for i in range(9):
            btn = tk.Button(root, text="", font=('Arial', 20), width=5, height=2,
                            command=lambda i=i: self.on_click(i))
            btn.grid(row=i//3, column=i%3)
            self.buttons.append(btn)

    def on_click(self, i):
        if self.board[i] == "" and not self.check_winner():
            self.board[i] = self.turn
            self.buttons[i].config(text=self.turn)
            if self.check_winner():
                messagebox.showinfo("Tic Tac Toe", f"Player {self.turn} wins!")
                self.root.quit()
            elif "" not in self.board:
                messagebox.showinfo("Tic Tac Toe", "It's a draw!")
                self.root.quit()
            else:
                self.turn = 'O' if self.turn == 'X' else 'X'

    def check_winner(self):
        winning_combos = [(0,1,2), (3,4,5), (6,7,8), (0,3,6), (1,4,7), (2,5,8), (0,4,8), (2,4,6)]
        for a, b, c in winning_combos:
            if self.board[a] == self.board[b] == self.board[c] and self.board[a] != "":
                return True
        return False

if __name__ == "__main__":
    root = tk.Tk()
    game = TicTacToe(root)
    root.mainloop()
