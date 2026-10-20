// Basic Library Management System - using localStorage to store JSON
// Data structure: books: [{id, title, author, isbn, year, copies}]

const STORAGE_KEY = 'lms_books_v1';
let books = [];
let editingId = null;

// Elements
const form = document.getElementById('book-form');
const titleInput = document.getElementById('title');
const authorInput = document.getElementById('author');
const isbnInput = document.getElementById('isbn');
const yearInput = document.getElementById('year');
const copiesInput = document.getElementById('copies');
const booksTableBody = document.querySelector('#books-table tbody');
const totalCount = document.getElementById('total-count');
const formTitle = document.getElementById('form-title');
const saveBtn = document.getElementById('save-btn');
const cancelBtn = document.getElementById('cancel-btn');
const searchInput = document.getElementById('search');
const clearSearchBtn = document.getElementById('clear-search');
const exportBtn = document.getElementById('export-btn');
const importBtn = document.getElementById('import-btn');
const importFile = document.getElementById('import-file');
const clearStorageBtn = document.getElementById('clear-storage');

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    books = raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('Failed to load data', e);
    books = [];
  }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(books));
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2,8);
}

function resetForm() {
  form.reset();
  editingId = null;
  formTitle.textContent = 'Add New Book';
  cancelBtn.classList.add('hidden');
  saveBtn.textContent = 'Save';
}

function render(list = books) {
  booksTableBody.innerHTML = '';
  list.forEach(b => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(b.title)}</td>
      <td>${escapeHtml(b.author)}</td>
      <td>${escapeHtml(b.isbn)}</td>
      <td>${b.year || ''}</td>
      <td>${b.copies || 1}</td>
      <td>
        <div class="row-actions">
          <button class="small-btn" data-action="edit" data-id="${b.id}">Edit</button>
          <button class="small-btn" data-action="delete" data-id="${b.id}">Delete</button>
        </div>
      </td>
    `;
    booksTableBody.appendChild(tr);
  });
  totalCount.textContent = `Total: ${list.length}`;
}

function escapeHtml(str){
  if(!str) return '';
  return str.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"})[c]);
}

function addBook(data) {
  const book = { id: uid(), ...data };
  books.push(book);
  save();
  render(books);
}

function updateBook(id, data) {
  const idx = books.findIndex(b => b.id === id);
  if (idx === -1) return false;
  books[idx] = { ...books[idx], ...data };
  save();
  render(books);
  return true;
}

function deleteBook(id) {
  books = books.filter(b => b.id !== id);
  save();
  render(books);
}

// Event handlers
form.addEventListener('submit', e => {
  e.preventDefault();
  const data = {
    title: titleInput.value.trim(),
    author: authorInput.value.trim(),
    isbn: isbnInput.value.trim(),
    year: yearInput.value ? Number(yearInput.value) : null,
    copies: copiesInput.value ? Number(copiesInput.value) : 1
  };

  if (!data.title || !data.author || !data.isbn) {
    alert('Please fill Title, Author and ISBN');
    return;
  }

  // if editing
  if (editingId) {
    if (updateBook(editingId, data)) {
      resetForm();
    }
  } else {
    addBook(data);
    resetForm();
  }
});

booksTableBody.addEventListener('click', e => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const action = btn.dataset.action;
  const id = btn.dataset.id;
  if (action === 'edit') {
    const b = books.find(x => x.id === id);
    if (!b) return;
    editingId = id;
    formTitle.textContent = 'Edit Book';
    titleInput.value = b.title;
    authorInput.value = b.author;
    isbnInput.value = b.isbn;
    yearInput.value = b.year || '';
    copiesInput.value = b.copies || 1;
    cancelBtn.classList.remove('hidden');
    saveBtn.textContent = 'Update';
    window.scrollTo({top:0,behavior:'smooth'});
  } else if (action === 'delete') {
    if (confirm('Delete this book?')) {
      deleteBook(id);
    }
  }
});

cancelBtn.addEventListener('click', () => {
  resetForm();
});

searchInput.addEventListener('input', () => {
  const q = searchInput.value.trim().toLowerCase();
  if (!q) return render(books);
  const filtered = books.filter(b =>
    (b.title && b.title.toLowerCase().includes(q)) ||
    (b.author && b.author.toLowerCase().includes(q)) ||
    (b.isbn && b.isbn.toLowerCase().includes(q))
  );
  render(filtered);
});

clearSearchBtn.addEventListener('click', () => {
  searchInput.value = '';
  render(books);
});

exportBtn.addEventListener('click', () => {
  const dataStr = JSON.stringify(books, null, 2);
  const blob = new Blob([dataStr], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'books_export.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

importBtn.addEventListener('click', () => importFile.click());
importFile.addEventListener('change', () => {
  const f = importFile.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = JSON.parse(reader.result);
      if (!Array.isArray(imported)) throw new Error('Invalid format');
      // assign ids if missing
      const processed = imported.map(i => ({ id: i.id || uid(), title: i.title||'', author: i.author||'', isbn: i.isbn||'', year: i.year||null, copies: i.copies||1 }));
      books = processed;
      save();
      render(books);
      importFile.value = '';
    } catch (e) {
      alert('Failed to import: ' + e.message);
    }
  }
  reader.readAsText(f);
});

clearStorageBtn.addEventListener('click', () => {
  if (confirm('Clear all books? This cannot be undone')) {
    books = [];
    save();
    render(books);
  }
});

// Init
load();
render(books);
