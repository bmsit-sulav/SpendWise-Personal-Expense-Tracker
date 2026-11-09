# SpendWise – Personal Expense Tracker

SpendWise is a console-based Personal Expense Tracker developed using **C++17**. It aims to help users record, manage, and analyze their daily expenses through a simple and interactive command-line interface.

The project is being developed to strengthen my understanding of Object-Oriented Programming (OOP), C++ Standard Template Library (STL), file handling, and software development practices.

## Features

- Interactive command-line menu.
- Add new expenses.
- View recorded expenses.
- Assign unique IDs to expenses.
- Store expense details such as amount, date, category, and description.

**Planned Features**
- Calculate total spending.
- Delete expenses.
- Persistent storage using file handling.
- Search and filter expenses.
- Monthly expense summaries.

## Technology Stack

- **Language:** C++17
- **Compiler:** GCC (g++)
- **Concepts:** Object-Oriented Programming, Classes, Encapsulation, Vectors, File Handling
- **Version Control:** Git and GitHub

## Project Structure

```text
SpendWise/
│
├── include/
│   └── Expense.h
│
├── src/
│   ├── Expense.cpp
│   └── main.cpp
│
├── tests/
│
├── data/
│
├── README.md
└── .gitignore
```

## Getting Started

### Prerequisites

- A C++ compiler supporting C++17 (such as GCC).
- Git (optional, for cloning the repository).

### Clone the Repository

```bash
git clone https://github.com/YOUR-USERNAME/SpendWise-CPP.git
cd SpendWise-CPP
```

### Compile the Project

Run the following command from the project root directory:

```bash
g++ -std=c++17 -Wall -Wextra -pedantic \
-Iinclude src/main.cpp src/Expense.cpp \
-o spendwise
```

### Run the Application

On macOS or Linux:

```bash
./spendwise
```

On Windows, run the generated executable:

```bash
spendwise.exe
```

## Learning Objectives

This project is intended to provide practical experience with:

- Designing and implementing C++ classes.
- Understanding encapsulation and constructors.
- Working with multiple source and header files.
- Using vectors to manage collections of objects.
- Understanding compilation and linking.
- Practicing Git and GitHub workflows.

## Development Status

**Currently in development.**

The basic expense management system is being implemented. Additional functionality, including persistent storage, expense deletion, searching, and spending summaries, will be added in future development stages.

## Future Improvements

- Implement file-based data persistence.
- Add expense editing and deletion.
- Introduce category-wise spending analysis.
- Generate monthly and yearly reports.
- Add automated unit testing.
- Improve input validation and error handling.

## Author

Developed as a personal C++ project to practice programming fundamentals and build practical software development experience.

## License

This project is licensed under the MIT License.
