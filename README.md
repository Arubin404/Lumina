# Caja Lumina 💡

Caja Lumina is a professional, high-performance, and elegant desktop application built to streamline and secure physical cash registers (income, outtakes, and balances) for businesses. Engineered for offline reliability and speed, it features a complete ledger system, intelligent cash denomination tracking, secure automated backups, and accounting period locks.

---

## Key Features 🚀

### 💵 Intelligent Cash Registry & Denominations
- **Strict Calculations**: All operations are managed in integer cents internally to guarantee absolute arithmetic accuracy and prevent any floating-point decimal issues.
- **Dynamic Cash Count**: Built-in physical count modal to balance expected drawer totals with real-world bill and coin configurations.
- **Refund & Reversions**: Safe editing workflow that dynamically adjusts the main cash box when entries are modified or deleted.

### 🔒 Accounting Controls & Auditing
- **Accounting Periods**: Lock historical days by closing a period. Once closed, the ledger entries within that period are locked to maintain permanent financial integrity.
- **Configurable Grace Window**: Define a custom number of days for allowed ledger modifications.
- **Auditing Logs**: Visual notification banners and status updates for edited records.

### 💾 Robust Database Backups & Restore
- **Offline Backups**: Automated backups to a custom directories selected natively on your desktop.
- **Safe Import & Restoration**: Validate SQLite database structures at runtime and replace database state atomics with zero server locks.
- **Single Instance Lock**: Ensures data integrity by allowing only one running desktop application at a time.

### 🎨 State-of-the-Art User Interface
- **Harmonious Dark Theme**: Sleek, eye-catching interface crafted with premium custom CSS styling, custom glassmorphism, and responsive states.
- **No Native Dialogs**: Rich custom alert modals built with Radix UI and Tailwind CSS for interactive prompts.

---

## Technology Stack 🛠️

- **Frontend**: React, TypeScript, Tailwind CSS, Radix UI, Lucide Icons, Vite
- **Data Management**: React Query, Zod
- **Backend & Native**: Node.js, Electron, Express
- **Database**: SQLite (`better-sqlite3`), Drizzle ORM

---

## Getting Started ⚙️

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+ recommended)
- [pnpm](https://pnpm.io/) (v8+ recommended)

### Installation

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/Arubin404/Lumina.git
   cd Lumina
   ```

2. **Install Dependencies**:
   ```bash
   pnpm install
   ```

3. **Initialize Database Schema**:
   ```bash
   pnpm run db:push
   ```

---

## Scripts & Development 💻

| Command | Description |
|---|---|
| `pnpm run dev` | Runs the full local development server. |
| `pnpm run check` | Checks TypeScript compilation and types. |
| `pnpm run build` | Compiles the production bundle and packages the desktop Electron installer. |
| `pnpm run start` | Launches the Electron desktop app in development mode. |

---

## Built Outputs 📦
When executing `pnpm run build`, the production-ready installation assets are packaged inside:
- `release-build/` - Native installers for desktop execution (e.g., `Caja Lumina Setup 1.0.4.exe`).

---

## License 📄
This project is licensed under the MIT License.
