from env.network_env import NetworkRoutingEnv

env = NetworkRoutingEnv()

state, info = env.reset()

print("Initial State:")
print(state)

for i in range(5):

    action = env.action_space.sample()

    next_state, reward, terminated, truncated, info = env.step(action)

    print("----------------------------")
    print("Action:", action)
    print("Next State:", next_state)
    print("Reward:", reward)

    if terminated:
        print("Episode Finished")
        break