echo "===== LATENCY ====="
sudo docker exec -it ra ping -c 5 172.27.0.3 | tail -1

echo
echo "===== HOP COUNT ====="
sudo docker exec -it ra traceroute -q 1 -w 1 172.27.0.3

echo
echo "===== OSPF ROUTE ====="
sudo docker exec -it ra vtysh -c "show ip route 172.27.0.0/16"

echo
echo "===== THROUGHPUT ====="
echo "Run: sudo docker exec -it ra iperf3 -c 172.27.0.3 -t 10"
