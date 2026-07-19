import gymnasium as gym
from gymnasium import spaces
import numpy as np
import pandas as pd


class NetworkRoutingEnv(gym.Env):
    """
    Custom Gym Environment for NetRouteAI
    """

    def __init__(self, csv_file="ai/data/network_metrics_clean.csv"):
        super(NetworkRoutingEnv, self).__init__()

        # Load collected network metrics
        self.data = pd.read_csv(csv_file)

        # Keep only required columns
        self.data = self.data[
            ["latency_ms", "packet_loss_percent", "bandwidth_mbps"]
        ].reset_index(drop=True)

        self.current_step = 0

        # Observation Space:
        # latency, packet loss, bandwidth
        self.observation_space = spaces.Box(
            low=np.array([0, 0, 0], dtype=np.float32),
            high=np.array([1000, 100, 10000], dtype=np.float32),
            dtype=np.float32
        )

        # Two possible routes
        self.action_space = spaces.Discrete(2)

    def reset(self, seed=None, options=None):
        super().reset(seed=seed)

        self.current_step = 0

        state = self.data.iloc[self.current_step].values.astype(np.float32)

        return state, {}

    def step(self, action):

        latency = self.data.iloc[self.current_step]["latency_ms"]
        packet_loss = self.data.iloc[self.current_step]["packet_loss_percent"]
        bandwidth = self.data.iloc[self.current_step]["bandwidth_mbps"]

        # Reward function
        reward = bandwidth - latency - (packet_loss * 5)

        # Temporary route preference
        if action == 0:
            reward += 5
        else:
            reward += 2

        self.current_step += 1

        terminated = self.current_step >= len(self.data)

        if terminated:
            next_state = np.zeros(3, dtype=np.float32)
        else:
            next_state = self.data.iloc[self.current_step].values.astype(np.float32)

        truncated = False

        info = {}

        return next_state, reward, terminated, truncated, info

    def render(self):
        pass