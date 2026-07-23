from stable_baselines3 import DQN
from ai.env.network_env import NetworkRoutingEnv

env = NetworkRoutingEnv()

model = DQN.load("ai/models/dqn_router")

obs, _ = env.reset()

for i in range(5):

    action, _ = model.predict(obs)

    obs, reward, done, truncated, info = env.step(action)

    print(f"Step {i+1}")
    print("Action:", action)
    print("Reward:", reward)
    print("State:", obs)

    if done:
        break