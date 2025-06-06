# Saturday Autotrade

Saturday Autotrade is an AI-driven cryptocurrency futures trading bot that uses OpenAI's GPT models to generate trading signals and automatically execute trades on Binance Futures. The bot supports automated AI-driven trading as well as manual trade input capabilities, with a focus on real-time monitoring and performance tracking.

## Overview

### Architecture and Technologies

Saturday Autotrade is a comprehensive system designed to facilitate automated and manual cryptocurrency trading with advanced AI capabilities. Here’s an overview of its architecture and technologies:

- **Frontend**: Built with React.js and Vite, using shadcn-ui component library and Tailwind CSS for modern, responsive design. Zustand is used for state management, while SWR handles intelligent data fetching.
- **Backend**: Developed with Golang and Gin for high-performance API endpoints, supporting Express-based REST API interactions. The backend handles trade execution and market data retrieval from Binance.
- **Database**: Utilizes MongoDB for persistent storage of trading activities, performance analytics, and market data caching.
- **APIs and Real-Time Data**: Integrates with OpenAI API for AI-driven trading signals and Binance Futures API for market data and trade execution. Utilizes WebSocket connections for real-time data updates.
- **Directory Structure**: The project is divided into two main parts:
  - `client/`: Contains the React.js frontend.
  - `server/`: Houses the Golang backend, facilitating API endpoints and database interactions.

## Features

Saturday Autotrade offers a variety of features to enhance trading functionality and user interaction:

### Main Dashboard Layout

- **Left Panel - Trading Controls**: 
  - Cryptocurrency selector dropdown
  - Auto/Manual mode toggle switch
  - Testnet/Real trading toggle
  - Confidence threshold slider
  - Timeframe selector checkboxes (5m, 15m, 30m, 1h, etc.)
  - "Generate Signal" button for AI analysis
  - Manual JSON input for direct signal input
  - "Execute Trade" button

- **Center Panel - Signal Display**:
  - Displays trading signals with detailed parameters and AI analysis

- **Right Panel - Live Information**:
  - Real-time transaction log, position updates, and market data status

- **Bottom Panel - Performance Metrics**:
  - Displays daily and all-time PnL, win/loss ratio, total trades, and performance streaks

### User Interaction Flows

- **Automated Trading Mode**: 
  Automatically generates and executes trades based on AI signals.
- **Manual Trading Mode**: 
  Users can manually request and execute AI-generated signals.
- **Manual JSON Input Mode**: 
  Advanced feature for direct signal input via JSON.

### Real-time Visual Features

- **Live Data Updates**: 
  Cryptocurrency prices, PnL calculations, position statuses, and transaction logs update in real-time.
- **Visual Indicators**: 
  Color schemes, confidence meters, status badges, and progress bars enhance user understanding.
- **Interactive Elements**: 
  Hover effects, loading spinners, success/error notifications, and responsive design ensure a seamless user experience.

### Configuration & Settings

- **User-Adjustable Settings**: 
  Allows customization of confidence thresholds, trading modes, environments, and AI models.
- **Safety Features**: 
  Includes warnings, balance verification, double confirmations for high-risk trades, and an emergency stop button for automated trading.

### Error Handling & User Feedback

- **Error Management**: 
  Provides clear error messages and fallback interfaces for service unavailability.
- **User Guidance**: 
  Tooltips, help text, warning messages, and success confirmations guide the user.

## Getting Started

### Requirements

Ensure the following technologies and setups are available on your computer:
- Node.js (for running the frontend and backend)
- NPM (Node Package Manager)
- MongoDB (for database)
- Golang (for backend development)

### Quickstart

Follow these steps to set up and run the project:

1. **Clone the Repository**:
   ```bash
   git clone <repository-url>
   cd saturday-autotrade
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Run the Project**:
   Start both frontend and backend concurrently using:
   ```bash
   npm run start
   ```

   - The frontend runs on port 5173.
   - The backend runs on port 3000.

4. **Configuration**:
   Ensure you have a `.env` file in the `server/` directory with the necessary environment variables for database connection, API keys for OpenAI, and Binance Futures.

### License

The project is proprietary (not open source), All rights reserved.

© 2024. Saturday Autotrade. All rights reserved.

---

By following this README, you should be able to understand the project's functionality and get it up and running quickly.# saturday
