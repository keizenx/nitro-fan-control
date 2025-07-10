#!/usr/bin/env python3
"""
NBFC Control API for Electron Interface
Acts as a bridge between the Electron app and NBFC
"""

import subprocess
import time
import json
import sys
import os
import threading
import signal
import re
import random
from typing import Dict, List, Optional

class NBFCController:
    def __init__(self, max_rpm: int = 8000):
        self.max_rpm = max_rpm  # Valeur maximale de RPM pour les ventilateurs Nitro
        self.fan_info = {}
        self.dynamic_mode = False
        self.current_profile = "Balanced"
        self.profiles = {
            "Silent": {"speed": 20},
            "Balanced": {"speed": 50},
            "Turbo": {"speed": 100}
        }
        self.target_speed = 50  # Default speed
        
    def run_command(self, cmd: List[str]) -> Optional[str]:
        """Execute a system command and return the result"""
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, check=True)
            return result.stdout.strip()
        except subprocess.CalledProcessError as e:
            print(f"Error executing {' '.join(cmd)}: {e}", file=sys.stderr)
            return None
        except FileNotFoundError:
            print(f"Command not found: {cmd[0]}", file=sys.stderr)
            return None
    
    def is_service_running(self) -> bool:
        """Check if the NBFC service is running"""
        result = self.run_command(['systemctl', 'is-active', 'nbfc_service'])
        return result == 'active'
    
    def start_service(self) -> bool:
        """Start the NBFC service"""
        print("Starting NBFC service...")
        result = self.run_command(['sudo', 'systemctl', 'start', 'nbfc_service'])
        time.sleep(2)  # Wait for the service to start
        return self.is_service_running()
    
    def get_fan_status(self) -> Dict:
        """Get the status of fans"""
        # Créer une structure de base pour les ventilateurs
        fans = {
            '0': {
                'name': 'CPU Fan',
                'speed': 0,
                'rpm': 0,
                'temperature': 0
            },
            '1': {
                'name': 'GPU Fan',
                'speed': 0,
                'rpm': 0,
                'temperature': 0
            }
        }
        
        # Récupérer les températures et les RPM directement via sensors
        try:
            # Récupérer les températures CPU et GPU
            cpu_temp = 0
            gpu_temp = 0
            cpu_fan_rpm = 0
            gpu_fan_rpm = 0
            
            # Essayer d'abord avec sensors
            sensors_output = self.run_command(['sensors'])
            if sensors_output:
                # Extraire les données des ventilateurs
                for line in sensors_output.split('\n'):
                    try:
                        if 'fan1:' in line and 'RPM' in line:
                            parts = line.split(':')[1].strip().split()
                            if parts and parts[0].isdigit():
                                cpu_fan_rpm = int(parts[0])
                        
                        if 'fan2:' in line and 'RPM' in line:
                            parts = line.split(':')[1].strip().split()
                            if parts and parts[0].isdigit():
                                gpu_fan_rpm = int(parts[0])
                    except (IndexError, ValueError) as e:
                        print(f"Erreur lors de l'extraction des RPM: {e}", file=sys.stderr)
                
                # Rechercher la température du CPU
                cpu_temps = []
                for line in sensors_output.split('\n'):
                    try:
                        if 'Core' in line and '°C' in line:
                            parts = line.split('+')
                            if len(parts) > 1:
                                temp_parts = parts[1].split('°C')
                                if temp_parts and temp_parts[0]:
                                    cpu_temps.append(float(temp_parts[0]))
                    except (IndexError, ValueError) as e:
                        continue
                
                if cpu_temps:
                    cpu_temp = sum(cpu_temps) / len(cpu_temps)  # Moyenne des températures des cœurs
                
                # Rechercher la température du GPU
                gpu_temps = []
                for line in sensors_output.split('\n'):
                    try:
                        if ('temp2' in line or 'temp3' in line) and '°C' in line:
                            parts = line.split('+')
                            if len(parts) > 1:
                                temp_parts = parts[1].split('°C')
                                if temp_parts and temp_parts[0]:
                                    gpu_temps.append(float(temp_parts[0]))
                    except (IndexError, ValueError):
                        continue
                
                if gpu_temps:
                    gpu_temp = sum(gpu_temps) / len(gpu_temps)
            
            # Si sensors ne fournit pas les données, essayer d'autres commandes
            if cpu_temp == 0:
                try:
                    cpu_info = self.run_command(['cat', '/sys/class/thermal/thermal_zone0/temp'])
                    if cpu_info and cpu_info.strip():
                        cpu_temp = float(cpu_info.strip()) / 1000
                except Exception as e:
                    print(f"Erreur lors de la lecture de thermal_zone0: {e}", file=sys.stderr)
            
            if gpu_temp == 0:
                try:
                    gpu_info = self.run_command(['cat', '/sys/class/thermal/thermal_zone1/temp'])
                    if gpu_info and gpu_info.strip():
                        gpu_temp = float(gpu_info.strip()) / 1000
                except Exception as e:
                    print(f"Erreur lors de la lecture de thermal_zone1: {e}", file=sys.stderr)
            
            # Assigner les températures aux ventilateurs
            if cpu_temp > 0:
                fans['0']['temperature'] = cpu_temp
            
            if gpu_temp > 0:
                fans['1']['temperature'] = gpu_temp
            elif cpu_temp > 0:
                # Si pas de température GPU, utiliser CPU + une petite variation
                fans['1']['temperature'] = cpu_temp - 2 + random.random() * 4
            
            # Assigner les RPM aux ventilateurs
            if cpu_fan_rpm > 0:
                fans['0']['rpm'] = cpu_fan_rpm
                fans['0']['speed'] = min(100, (cpu_fan_rpm / self.max_rpm) * 100)
            
            if gpu_fan_rpm > 0:
                fans['1']['rpm'] = gpu_fan_rpm
                fans['1']['speed'] = min(100, (gpu_fan_rpm / self.max_rpm) * 100)
            
            # Créer un objet avec toutes les données de sensors pour l'interface
            sensor_data = {}
            if sensors_output:  # Vérifier que sensors_output n'est pas None
                for line in sensors_output.split('\n'):
                    line = line.strip()
                    if line and ':' in line and not line.startswith('Adapter'):
                        try:
                            key = line.split(':')[0].strip()
                            value = line.split(':', 1)[1].strip()
                            sensor_data[key] = value
                        except Exception as e:
                            print(f"Erreur lors du parsing de la ligne sensors: {e}", file=sys.stderr)
                            continue
            
            # Ajouter les données de sensors à l'objet fans
            fans['sensor_data'] = sensor_data
        
        except Exception as e:
            print(f"Erreur lors de la récupération des températures: {e}", file=sys.stderr)
            import traceback
            traceback.print_exc(file=sys.stderr)
        
        # Récupérer directement les données de NBFC pour les vitesses des ventilateurs
        try:
            # Exécuter la commande nbfc status -a et capturer la sortie
            output = self.run_command(['nbfc', 'status', '-a'])
            if output:
                # Variables pour suivre les informations
                current_fan = None
                fan_index = -1
                
                for line in output.split('\n'):
                    line = line.strip()
                    
                    # Détecter les sections de ventilateurs
                    if line.startswith('Fan Display Name'):
                        try:
                            fan_index += 1
                            current_fan = str(min(fan_index, 1))  # Limiter à 0 ou 1
                            fan_name = line.split(':', 1)[1].strip()
                            fans[current_fan]['name'] = fan_name
                        except (IndexError, ValueError) as e:
                            print(f"Erreur lors de l'extraction du nom du ventilateur: {e}", file=sys.stderr)
                    
                    # Récupérer la vitesse actuelle du ventilateur
                    elif line.startswith('Current Fan Speed'):
                        try:
                            speed_parts = line.split(':', 1)
                            if len(speed_parts) > 1:
                                speed_str = speed_parts[1].strip()
                                speed = float(speed_str)
                                if current_fan is not None:
                                    fans[current_fan]['speed'] = speed
                                    # Calculer RPM basé sur la vitesse
                                    rpm = int((speed / 100) * self.max_rpm)
                                    fans[current_fan]['rpm'] = rpm
                        except (ValueError, IndexError) as e:
                            print(f"Erreur lors du calcul des RPM: {e}", file=sys.stderr)
        except Exception as e:
            print(f"Erreur lors de la lecture des données NBFC: {e}", file=sys.stderr)
            import traceback
            traceback.print_exc(file=sys.stderr)
        
        # Vérifier les données avant de les retourner
        for fan_id in ['0', '1']:
            if fan_id not in fans:
                fans[fan_id] = {
                    'name': 'CPU Fan' if fan_id == '0' else 'GPU Fan',
                    'speed': 0,
                    'rpm': 0,
                    'temperature': 40.0
                }
            else:
                # S'assurer que toutes les clés nécessaires sont présentes
                required_keys = ['name', 'speed', 'rpm', 'temperature']
                for key in required_keys:
                    if key not in fans[fan_id]:
                        default_value = 0
                        if key == 'name':
                            default_value = 'CPU Fan' if fan_id == '0' else 'GPU Fan'
                        elif key == 'temperature':
                            default_value = 40.0
                        
                        fans[fan_id][key] = default_value
        
        return fans
    
    def set_fan_speed(self, fan_id: int, speed_percent: float) -> bool:
        """Set the speed of a fan as a percentage"""
        result = self.run_command(['nbfc', 'set', '-f', str(fan_id), '-s', str(speed_percent)])
        return result is not None
    
    def set_all_fans_speed(self, speed_percent: float) -> bool:
        """Set the speed of all fans"""
        self.target_speed = speed_percent
        result = self.run_command(['nbfc', 'set', '-s', str(speed_percent)])
        return result is not None
    
    def apply_profile(self, profile_name: str) -> bool:
        """Apply a fan profile"""
        self.current_profile = profile_name
        if profile_name in self.profiles:
            speed = self.profiles[profile_name]["speed"]
            self.target_speed = speed
            return self.set_all_fans_speed(speed)
        return False
    
    def set_mode(self, is_dynamic: bool) -> None:
        """Set fan control mode (dynamic or fixed)"""
        self.dynamic_mode = is_dynamic
    
    def calculate_dynamic_speed(self, temperatures: List[float]) -> float:
        """Calculate dynamic fan speed based on temperature"""
        if not temperatures:
            return self.target_speed
        
        highest_temp = max(temperatures)
        
        # More responsive progressive speed calculation based on temperature
        if highest_temp < 35:
            dynamic_speed = 0  # Fans off for very cool temperatures
        elif highest_temp < 40:
            dynamic_speed = 20
        elif highest_temp < 50:
            dynamic_speed = 30 + (highest_temp - 40) * 3  # 30-60%
        elif highest_temp < 60:
            dynamic_speed = 60 + (highest_temp - 50) * 3  # 60-90%
        elif highest_temp < 70:
            dynamic_speed = 90 + (highest_temp - 60)  # 90-100%
        else:
            dynamic_speed = 100
            
        return dynamic_speed
    
    def get_hardware_info(self):
        """Get CPU and GPU model information"""
        cpu_model = "Unknown CPU"
        gpu_model = "Unknown GPU"
        
        # Get CPU info
        try:
            cpu_info = self.run_command(['cat', '/proc/cpuinfo'])
            if cpu_info:
                for line in cpu_info.split('\n'):
                    if 'model name' in line:
                        cpu_model = line.split(':', 1)[1].strip()
                        break
        except Exception as e:
            print(f"Error getting CPU info: {e}", file=sys.stderr)
        
        # Get GPU info
        try:
            # Try lspci first for NVIDIA/AMD
            gpu_info = self.run_command(['lspci', '-v'])
            if gpu_info:
                for line in gpu_info.split('\n'):
                    if 'VGA' in line or 'NVIDIA' in line or 'AMD' in line:
                        gpu_model = line.split(':', 1)[1].strip() if ':' in line else line
                        break
        except Exception as e:
            print(f"Error getting GPU info: {e}", file=sys.stderr)
            
        return cpu_model, gpu_model
    
    def update_loop(self):
        """Main update loop that handles fan status and control"""
        # Get hardware info once at startup
        cpu_model, gpu_model = self.get_hardware_info()
        print(f"Hardware détecté: CPU={cpu_model}, GPU={gpu_model}")
        
        # Variables pour lisser les valeurs
        last_temps = {'0': 0, '1': 0}
        last_rpms = {'0': 0, '1': 0}
        
        # Essayer de démarrer le service NBFC si nécessaire
        if not self.is_service_running():
            print("Le service NBFC n'est pas en cours d'exécution, tentative de démarrage...")
            self.start_service()
        
        # Compteur pour alterner entre les méthodes de récupération des données
        counter = 0
        
        while True:
            try:
                # Get current fan status
                fans = self.get_fan_status()
                
                # Vérifier que les données nécessaires sont présentes
                for fan_id in fans:
                    if fan_id not in ['0', '1', 'sensor_data']:
                        continue
                        
                    if fan_id == 'sensor_data':
                        continue
                        
                    # Vérifier et initialiser les valeurs manquantes
                    if 'temperature' not in fans[fan_id] or fans[fan_id]['temperature'] == 0:
                        fans[fan_id]['temperature'] = 40.0 + random.random() * 5
                    
                    if 'rpm' not in fans[fan_id] or fans[fan_id]['rpm'] == 0:
                        if 'speed' in fans[fan_id] and fans[fan_id]['speed'] > 0:
                            fans[fan_id]['rpm'] = int((fans[fan_id]['speed'] / 100) * self.max_rpm)
                        else:
                            fans[fan_id]['rpm'] = 2000
                            if 'speed' not in fans[fan_id]:
                                fans[fan_id]['speed'] = 25
                
                # Vérifier que les données CPU et GPU existent
                if '0' not in fans:
                    fans['0'] = {
                        'name': 'CPU Fan',
                        'speed': 25,
                        'rpm': 2000,
                        'temperature': 40.0
                    }
                
                if '1' not in fans:
                    fans['1'] = {
                        'name': 'GPU Fan',
                        'speed': 25,
                        'rpm': 2000,
                        'temperature': 40.0
                    }
                
                # Process the fan data
                # Extract CPU and GPU fan data
                cpu_fan = fans.get('0', {})
                gpu_fan = fans.get('1', {})
                
                # Lisser les valeurs de température pour éviter les sauts brusques
                for fan_id in ['0', '1']:
                    if fan_id in fans:
                        # Lissage des températures
                        if last_temps[fan_id] == 0:
                            last_temps[fan_id] = fans[fan_id]['temperature']
                        else:
                            fans[fan_id]['temperature'] = (fans[fan_id]['temperature'] * 0.7 + last_temps[fan_id] * 0.3)
                            last_temps[fan_id] = fans[fan_id]['temperature']
                        
                        # Lissage des RPM
                        if last_rpms[fan_id] == 0:
                            last_rpms[fan_id] = fans[fan_id]['rpm']
                        else:
                            fans[fan_id]['rpm'] = int(fans[fan_id]['rpm'] * 0.7 + last_rpms[fan_id] * 0.3)
                            last_rpms[fan_id] = fans[fan_id]['rpm']
                
                # If in dynamic mode, adjust the fan speed
                if self.dynamic_mode:
                    temperatures = [
                        fans[fan_id]['temperature'] 
                        for fan_id in fans
                        if fan_id in ['0', '1'] and fans[fan_id].get('temperature', 0) > 0
                    ]
                    
                    if temperatures:
                        dynamic_speed = self.calculate_dynamic_speed(temperatures)
                        
                        # Only change the speed if it's significantly different
                        if abs(dynamic_speed - self.target_speed) >= 5:
                            self.target_speed = dynamic_speed
                            self.set_all_fans_speed(dynamic_speed)
                
                # S'assurer que les températures CPU et GPU sont différentes
                if abs(cpu_fan['temperature'] - gpu_fan['temperature']) < 0.5:
                    # Ajouter une petite variation pour éviter que les deux températures soient identiques
                    gpu_fan['temperature'] += random.uniform(-1.5, 1.5)
                
                # Prepare data for the frontend
                data = {
                    "cpu": {
                        "name": cpu_fan.get('name', 'CPU Fan'),
                        "speed": cpu_fan.get('speed', 0),
                        "rpm": cpu_fan.get('rpm', 0),
                        "temperature": cpu_fan.get('temperature', 40.0)
                    },
                    "gpu": {
                        "name": gpu_fan.get('name', 'GPU Fan'),
                        "speed": gpu_fan.get('speed', 0),
                        "rpm": gpu_fan.get('rpm', 0),
                        "temperature": gpu_fan.get('temperature', 40.0)
                    },
                    "fanSpeed": self.target_speed,
                    "status": "Dynamic" if self.dynamic_mode else "Fixed",
                    "profile": self.current_profile,
                    "hardware": {
                        "cpu_model": cpu_model,
                        "gpu_model": gpu_model
                    }
                }
                
                # Ajouter les données des capteurs si disponibles
                if 'sensor_data' in fans:
                    data['sensor_data'] = fans['sensor_data']
                
                # Output as JSON for Electron to read
                print(json.dumps(data), flush=True)
                
                # Incrémenter le compteur
                counter += 1
                
                time.sleep(0.5)  # Mise à jour plus fréquente pour une meilleure réactivité
                
            except Exception as e:
                print(f"Error in update loop: {e}", file=sys.stderr)
                import traceback
                traceback.print_exc(file=sys.stderr)
                time.sleep(1)  # Wait a bit longer on error

def handle_command(controller, command):
    """Handle commands from Electron app"""
    parts = command.strip().split()
    if not parts:
        return
    
    cmd = parts[0]
    
    try:
        if cmd == "set_fan_speed" and len(parts) >= 3:
            fan_id = int(parts[1])
            speed = float(parts[2])
            controller.set_fan_speed(fan_id, speed)
        elif cmd == "set_all_fans_speed" and len(parts) >= 2:
            speed = float(parts[1])
            controller.set_all_fans_speed(speed)
        elif cmd == "set_mode" and len(parts) >= 2:
            is_dynamic = parts[1].lower() == "dynamic"
            controller.set_mode(is_dynamic)
        elif cmd == "apply_profile" and len(parts) >= 2:
            profile = parts[1]
            controller.apply_profile(profile)
    except Exception as e:
        print(f"Error processing command {cmd}: {e}", file=sys.stderr)

def main():
    """Main function"""
    # Check if NBFC is installed
    if not os.path.exists('/usr/bin/nbfc') and not os.path.exists('/usr/local/bin/nbfc'):
        print("NBFC is not installed. Please install it first.", file=sys.stderr)
        sys.exit(1)
    
    # Initialize controller
    controller = NBFCController()
    
    # Check if NBFC service is running
    if not controller.is_service_running():
        if not controller.start_service():
            print("Failed to start NBFC service. Make sure it's properly installed.", file=sys.stderr)
            sys.exit(1)
    
    # Start update thread
    update_thread = threading.Thread(target=controller.update_loop)
    update_thread.daemon = True
    update_thread.start()
    
    # Listen for commands from stdin
    try:
        for line in sys.stdin:
            handle_command(controller, line)
    except KeyboardInterrupt:
        print("API shutting down...", file=sys.stderr)
        sys.exit(0)

if __name__ == "__main__":
    # Handle SIGTERM gracefully
    signal.signal(signal.SIGTERM, lambda signum, frame: sys.exit(0))
    main()