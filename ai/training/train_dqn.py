from stable_baselines3 import DQN
import sys
import os

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from ai.env.network_env import NetworkRoutingEnv
import os

env = NetworkRoutingEnv()

model = DQN(
    "MlpPolicy",
    env,
    verbose=1,
    learning_rate=0.001,
    buffer_size=10000,
    learning_starts=100,
    batch_size=32,
    gamma=0.99
)

model.learn(total_timesteps=5000)

os.makedirs("ai/models", exist_ok=True)
model.save("ai/models/dqn_router")

print("Model saved successfully!")