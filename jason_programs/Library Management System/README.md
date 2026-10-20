Library Management System (basic)

Files:
- index.html : Main UI
- styles.css : Styles
- script.js : CRUD logic using localStorage as JSON storage

Usage:
- Open index.html in a browser.
- Add, edit, delete books.
- Export and import JSON.
- Data persists in localStorage under key `lms_books_v1`.

Notes:
- This is a client-only demo. For a real backend, replace localStorage calls with fetch to an API.
- IDs are generated with a simple uid function.
