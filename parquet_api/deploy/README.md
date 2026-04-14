# VM deployment (spike)

Target: Ubuntu 24.04 B2s, `azureuser@20.82.3.63`, service on port `8001`.

## One-time setup

```bash
sudo apt update
sudo apt install -y python3-venv python3-pip unixodbc unixodbc-dev

# Microsoft ODBC driver for SQL Server (Ubuntu 24.04)
curl https://packages.microsoft.com/keys/microsoft.asc | sudo tee /etc/apt/trusted.gpg.d/microsoft.asc
curl https://packages.microsoft.com/config/ubuntu/24.04/prod.list | sudo tee /etc/apt/sources.list.d/mssql-release.list
sudo apt update
sudo ACCEPT_EULA=Y apt install -y msodbcsql18

sudo mkdir -p /opt/tfmstats-api /opt/tfmstats-api/data
sudo chown -R azureuser:azureuser /opt/tfmstats-api
```

## Deploy the code

From a workstation with this repo checked out:

```bash
scp -i parquet_api/id_rsa -r \
    parquet_api/app \
    parquet_api/deploy \
    parquet_api/export_db.py \
    parquet_api/requirements.txt \
    parquet_api/db_config.json \
    azureuser@20.82.3.63:/opt/tfmstats-api/
```

Then on the VM:

```bash
cd /opt/tfmstats-api
python3 -m venv venv
./venv/bin/pip install --upgrade pip
./venv/bin/pip install -r requirements.txt
```

## First export (manual, slow)

```bash
cd /opt/tfmstats-api
./venv/bin/python export_db.py
ls -lh data/
```

## Install the service

```bash
sudo cp /opt/tfmstats-api/deploy/tfmstats-api.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now tfmstats-api
sudo systemctl status tfmstats-api
curl http://127.0.0.1:8001/health
curl http://127.0.0.1:8001/api/corporations/playerstats | head -c 500
```

## Open the port

In the Azure portal, add an inbound NSG rule on the VM's NIC: TCP 8001 from Any (or restrict to your IP for the spike).

Then from a workstation: `curl http://20.82.3.63:8001/health`.

## Cron (daily export)

```bash
sudo touch /var/log/tfmstats-export.log
sudo chown azureuser:azureuser /var/log/tfmstats-export.log
crontab -u azureuser /opt/tfmstats-api/deploy/export.cron
crontab -u azureuser -l
```

## Follow-ups (not in this spike)

- Put nginx + Let's Encrypt in front on a subdomain (`vm-api.tfmstats.com`) so the HTTPS tfmstats.com frontend can call it without mixed-content errors.
- Move the other heavy analytics endpoints over once parity is confirmed.
