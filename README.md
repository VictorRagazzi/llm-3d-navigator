# 3D LLM Navigation Agent 

An experimental prototype of an autonomous navigation agent that uses Large Language Models (LLMs) to navigate simulated 3D environments. The agent processes spatial data, avoids obstacles, and calculates the most efficient path to a target (the door) using a closed-loop feedback system.

## Key Features

*   **Context-Aware Navigation**: The agent receives its coordinates and surrounding obstacle data (distance, bearing, volume) via JSON and determines the next best move.
*   **Collision Detection Engine**: A built-in 2D geometry engine validates the agent's steps against room boundaries and objects before execution.
*   **Dynamic Feedback Loop**: The model is informed of real-time events (such as collisions or successful steps), allowing it to adjust its strategy in the next turn.
*   **Interactive Canvas Visualization**: A custom React interface using HTML5 Canvas to track the agent’s path, starting position, and target in real-time.
*   **Session Data Export**: Ability to download detailed JSON logs containing inference counts, distance traveled, and collision metrics for further analysis.

## 🛠️ Tech Stack

*   **Framework**: React + TypeScript
*   **Rendering**: HTML5 Canvas API
*   **Styling**: Inline CSS with a "Dark Terminal" aesthetic
*   **AI Integration**: Support for OpenRouter (GPT-4o-mini), Anthropic, and local LLMs.

## How It Works

1.  **Spatial Encoding**: The system translates the 3D scene into a structured text prompt. It calculates the `bearing` (0-359°) and `distance` for every object relative to the agent.
2.  **LLM Reasoning**:
    *   The agent analyzes its current state and the obstacle list.
    *   It outputs a strictly formatted JSON response containing its `reasoning`, a series of `steps`, and a boolean `arrived` status.
3.  **Execution & Validation**: The simulation attempts to move the agent. If a path intersects with an object's bounding box, the movement is canceled, and a "collision event" is sent back to the LLM's history.
4.  **Completion**: The session ends when the agent reaches the arrival threshold (< 0.8m from the door) or exceeds the maximum turn limit (30).

## Setup & Installation

1.  **Clone the repository**:
    ```bash
    git clone [https://github.com/your-username/llm-3d-navigation.git](https://github.com/your-username/llm-3d-navigation.git)
    ```
2.  **Install dependencies**:
    ```bash
    npm install
    ```
3.  **Environment Variables**:
    Create a `.env` file in the root directory and add your API keys:
    
```env
    VITE_OPENROUTER_API_KEY=your_key_here
    ```
4.  **Run the project**:
    ```bash
    npm run dev
    ```

## Navigation Logic

The agent follows a specific bearing convention to navigate the grid:
*   **0°**: North (-z)
*   **90°**: East (+x)
*   **180°**: South (+z)
*   **270°**: West (-x)

It is constrained to a maximum of **3 steps per turn**, with each step being exactly **0.5m**.

---

### 📝 Author
**Victor Hugo de S. S. Ragazzi**  
*Graduate Student & Developer*
