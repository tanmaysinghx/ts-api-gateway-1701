import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { GlassCardComponent } from '../../shared/components/glass-card/glass-card';
import { PulseNodeComponent } from '../../shared/components/pulse-node/pulse-node';

@Component({
  selector: 'app-services',
  standalone: true,
  imports: [CommonModule, FormsModule, GlassCardComponent, PulseNodeComponent],
  template: `
    <div class="space-y-6 relative">
      <!-- Ambient purple light -->
      <div class="absolute top-0 right-0 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl pointer-events-none"></div>

      <!-- Header Section -->
      <div>
        <h1 class="text-xl font-black text-slate-100 flex items-center gap-2">
          🌐 Ingress Cluster Routing & Registry
        </h1>
        <p class="text-xs text-slate-400 mt-1">Register, monitor, and configure active target microservices on the gateway</p>
      </div>

      <!-- Content Grid -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        <!-- Services Registry List (Takes 2 columns) -->
        <div class="lg:col-span-2">
          <app-glass-card title="Active Microservices Catalog" icon="📋" extraClass="h-full">
            <div class="overflow-x-auto">
              <table class="w-full text-left border-collapse">
                <thead>
                  <tr class="border-b border-white/5 text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                    <th class="pb-3">Cluster Info</th>
                    <th class="pb-3">Route Prefix</th>
                    <th class="pb-3">Protocol / Tech</th>
                    <th class="pb-3">Active Instances Status</th>
                    <th class="pb-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-white/5 text-sm">
                  @for (svc of services(); track svc.id) {
                    <tr>
                      <td class="py-3.5 pr-2">
                        <div class="font-bold text-slate-100">{{ svc.name }}</div>
                        <div class="text-[10px] text-slate-500 font-mono">{{ svc.id }}</div>
                      </td>
                      <td class="py-3.5 font-mono text-cyan-400 text-xs">{{ svc.prefix }}</td>
                      <td class="py-3.5">
                        <span class="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-md bg-white/5 border border-white/5 mr-1 text-purple-400">
                          {{ svc.protocol }}
                        </span>
                        <span class="text-[10px] text-slate-400 font-medium">{{ svc.tech_stack }}</span>
                      </td>
                      <td class="py-3.5">
                        <div class="flex flex-col gap-1">
                          @for (inst of svc.instances; track inst.id) {
                            <app-pulse-node [healthy]="inst.healthy" [label]="inst.url"></app-pulse-node>
                          } @empty {
                            <span class="text-xs text-slate-500 italic">No node instances added</span>
                          }
                        </div>
                      </td>
                      <td class="py-3.5 text-right">
                        <button (click)="deleteService(svc.id)"
                          class="bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-bold px-3 py-1 rounded-lg border border-rose-500/10 hover:border-rose-500/30 transition-all duration-300">
                          De-register
                        </button>
                      </td>
                    </tr>
                  } @empty {
                    <tr>
                      <td colspan="5" class="py-12 text-center text-slate-500 italic">
                        No active microservices registered in Gateway Catalog.
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </app-glass-card>
        </div>

        <!-- Register Form Sidebar (Takes 1 column) -->
        <div>
          <app-glass-card title="Register New Cluster" icon="➕">
            <form (ngSubmit)="registerService()" class="space-y-4 text-xs">
              <div>
                <label class="block text-[10px] font-semibold text-slate-300 uppercase tracking-wider mb-1">Service Identifier (ID)</label>
                <input type="text" name="id" [(ngModel)]="form.id" required
                  class="w-full bg-slate-950/40 border border-white/10 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-cyan-500/40 transition-all duration-300"
                  placeholder="users-cluster">
              </div>

              <div>
                <label class="block text-[10px] font-semibold text-slate-300 uppercase tracking-wider mb-1">Human-Friendly Name</label>
                <input type="text" name="name" [(ngModel)]="form.name" required
                  class="w-full bg-slate-950/40 border border-white/10 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-cyan-500/40 transition-all duration-300"
                  placeholder="User Profile Management">
              </div>

              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-[10px] font-semibold text-slate-300 uppercase tracking-wider mb-1">Protocol</label>
                  <select name="protocol" [(ngModel)]="form.protocol"
                    class="w-full bg-slate-950/40 border border-white/10 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-cyan-500/40 transition-all duration-300">
                    <option value="REST">REST</option>
                    <option value="SOAP">SOAP</option>
                    <option value="gRPC">gRPC</option>
                  </select>
                </div>
                <div>
                  <label class="block text-[10px] font-semibold text-slate-300 uppercase tracking-wider mb-1">Route Prefix</label>
                  <input type="text" name="prefix" [(ngModel)]="form.prefix" required
                    class="w-full bg-slate-950/40 border border-white/10 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-cyan-500/40 transition-all duration-300"
                    placeholder="/api">
                </div>
              </div>

              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-[10px] font-semibold text-slate-300 uppercase tracking-wider mb-1">Tech Stack</label>
                  <input type="text" name="techStack" [(ngModel)]="form.techStack"
                    class="w-full bg-slate-950/40 border border-white/10 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-cyan-500/40 transition-all duration-300"
                    placeholder="Go">
                </div>
                <div>
                  <label class="block text-[10px] font-semibold text-slate-300 uppercase tracking-wider mb-1">Health Path</label>
                  <input type="text" name="healthCheckPath" [(ngModel)]="form.healthCheckPath"
                    class="w-full bg-slate-950/40 border border-white/10 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-cyan-500/40 transition-all duration-300"
                    placeholder="/health">
                </div>
              </div>

              <div>
                <label class="block text-[10px] font-semibold text-slate-300 uppercase tracking-wider mb-1">Service Instances (CSV)</label>
                <input type="text" name="instances" [(ngModel)]="form.instances" required
                  class="w-full bg-slate-950/40 border border-white/10 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-cyan-500/40 transition-all duration-300"
                  placeholder="http://localhost:8081,http://localhost:8082">
              </div>

              <div class="flex items-center gap-2 py-1">
                <input type="checkbox" name="requiresAuth" [(ngModel)]="form.requiresAuth" id="requiresAuth"
                  class="accent-cyan-500 h-4 w-4 bg-slate-950 border border-white/10 rounded">
                <label for="requiresAuth" class="text-[10px] font-semibold text-slate-300 uppercase tracking-wider select-none">Enforce Cryptographic JWT Auth</label>
              </div>

              <div class="grid grid-cols-2 gap-3 border-t border-white/5 pt-3">
                <div>
                  <label class="block text-[10px] font-semibold text-slate-300 uppercase tracking-wider mb-1">Rate Limit (req/s)</label>
                  <input type="number" name="rateLimitLimit" [(ngModel)]="form.rateLimitLimit"
                    class="w-full bg-slate-950/40 border border-white/10 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-cyan-500/40 transition-all duration-300"
                    placeholder="10.0">
                </div>
                <div>
                  <label class="block text-[10px] font-semibold text-slate-300 uppercase tracking-wider mb-1">Burst Margin</label>
                  <input type="number" name="rateLimitBurst" [(ngModel)]="form.rateLimitBurst"
                    class="w-full bg-slate-950/40 border border-white/10 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-cyan-500/40 transition-all duration-300"
                    placeholder="15">
                </div>
              </div>

              <button type="submit"
                class="w-full bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-slate-100 font-bold py-2.5 px-4 rounded-lg shadow-lg shadow-cyan-500/10 hover:shadow-cyan-500/20 transition-all duration-300">
                Deploy Cluster Configuration
              </button>
            </form>
          </app-glass-card>
        </div>

      </div>
    </div>
  `
})
export class ServicesComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);

  services = signal<any[]>([]);
  private pollInterval: any;

  form = {
    id: '',
    name: '',
    prefix: '',
    protocol: 'REST',
    techStack: 'Go',
    healthCheckPath: '/health',
    instances: '',
    requiresAuth: false,
    rateLimitLimit: 10,
    rateLimitBurst: 15
  };

  ngOnInit() {
    this.fetchServices();
    this.pollInterval = setInterval(() => this.fetchServices(), 2000);
  }

  ngOnDestroy() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }
  }

  fetchServices() {
    this.api.getServices().subscribe({
      next: (data) => this.services.set(data || []),
      error: (err) => console.error('Failed to poll catalog', err)
    });
  }

  registerService() {
    if (!this.form.id || !this.form.name || !this.form.prefix || !this.form.instances) {
      alert('ID, Name, Prefix, and instances CSV are required!');
      return;
    }

    const payload = {
      id: this.form.id,
      name: this.form.name,
      prefix: this.form.prefix,
      protocol: this.form.protocol,
      tech_stack: this.form.techStack,
      health_check_path: this.form.healthCheckPath,
      load_balancer_policy: 'RoundRobin',
      instances: this.form.instances.split(',').map(url => url.trim()),
      requires_auth: this.form.requiresAuth,
      rate_limit_limit: this.form.rateLimitLimit,
      rate_limit_burst: this.form.rateLimitBurst
    };

    this.api.registerService(payload).subscribe({
      next: () => {
        this.fetchServices();
        this.form = {
          id: '',
          name: '',
          prefix: '',
          protocol: 'REST',
          techStack: 'Go',
          healthCheckPath: '/health',
          instances: '',
          requiresAuth: false,
          rateLimitLimit: 10,
          rateLimitBurst: 15
        };
      },
      error: (err) => alert('Registration failed: ' + (err.error || err.message))
    });
  }

  deleteService(id: string) {
    if (confirm(`De-register cluster ${id} from Gateway catalog?`)) {
      this.api.deregisterService(id).subscribe({
        next: () => this.fetchServices(),
        error: (err) => alert('De-registration failed: ' + (err.error || err.message))
      });
    }
  }
}
