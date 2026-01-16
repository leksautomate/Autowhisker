# Autowhisker

A powerful local web application designed to automate image generation using the Google Whisk API. This tool allows you to batch process prompts, manage generation queues, and organize your AI-generated artwork efficiently.

![App Screenshot](https://github.com/leksautomate/Autowhisker/blob/main/public/image.png)

## 🚀 Key Features

*   **Batch Generation**: Queue up multiple text prompts and generate images sequentially without manual intervention.
*   **Smart Queue Management**:
    *   **Status Tracking**: Real-time status updates (Pending, Processing, Completed, Error).
    *   **Controls**: Pause, Resume, and Stop the generation process at any time.
    *   **Editing**: Edit prompts directly in the queue before them being processed or if they error out.
    *   **Retry**: One-click retry for failed generations.
*   **Flexible Configuration**:
    *   **Aspect Ratios**: Support for Landscape (16:9), Portrait (9:16), and Square (1:1).
    *   **Session Management**: Key-based authentication with cookie validation to ensure stable connections to the Whisk API.
*   **Local & Project Management**:
    *   **Local Storage**: All generated images are automatically saved to a local `output` directory.
    *   **Export**: Download individual images or zip up the entire project with a custom name.
    *   **Gallery**: View generated images instantly within the application.
    *   **Cleanup**: specific tools to clear the gallery and delete files from the disk.

## 🛠️ Technology Stack

*   **Frontend**: React, TypeScript, Vite, Tailwind CSS
*   **Backend**: Node.js, Express
*   **API Integration**: `@rohitaryal/whisk-api`

## 📦 Installation & Setup

1.  **Clone the repository**:
    ```bash
    git clone <repository-url>
    cd autowhisker
    ```

2.  **Install Dependencies**:
    ```bash
    npm install
    ```

3.  **Start the Application**:
    This will start both the frontend (Vite) and the backend (Express) server.
    ```bash
    npm run dev:all
    # OR if you need to run them separately:
    # Terminal 1: node server/index.js
    # Terminal 2: npm run dev
    ```


    **Recommended Usage**:
    1.  Start the backend:
        ```bash
        node server/index.js
        ```
    2.  Start the frontend:
        ```bash
        npm run dev
        ```

4.  **Access the App**:
    Open your browser and navigate to `http://localhost:5173` (or the port shown in your terminal).

## 🎮 How to Use

1.  **Configure Session**:
    *   Obtain your Google Whisk cookie (from browser developer tools on the Whisk website).
    *   Paste it into the **Cookie** field in the left sidebar.
    *   Click **Check & Save** to validate your session.

2.  **Add Prompts**:
    *   Type or paste your prompts into the "Prompts List" text area (one prompt per line).
    *   Select your desired **Aspect Ratio**.

3.  **Start Generation**:
    *   Click **START NOW** to begin processing the queue.
    *   The app will process prompts one by one.

4.  **Manage Results**:
    *   View images as they appear in the list.
    *   Click **Download** on individual items or **Download ZIP** for the whole set.

## ⚠️ Important Notes

*   **Cookie Expiry**: Google Whisk cookies may expire. If you see authentication errors, refresh your cookie from the Whisk website and update it in the app.
*   **Local Output**: Images are stored in the `Autowhisker/output` folder.

## 📄 License

[MIT](LICENSE)
#
