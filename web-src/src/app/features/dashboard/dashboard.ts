import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../core/services/api.service';
import { GlassCardComponent } from '../../shared/components/glass-card/glass-card';
import { LogsComponent } from '../logs/logs';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, GlassCardComponent, LogsComponent],
  template: `
    <div class="space-y-6 relative">
      <!-- Ambient light bubble -->
      <div class="absolute top-0 right-0 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none"></div>

      <!-- Header Section -->
      <div>
        <h1 class="text-xl font-black text-slate-100 flex items-center gap-2">
          📊 Performance Metrics & Telemetry
        </h1>
        <p class="text-xs text-slate-400 mt-1">Real-time health statistics and system ingress logs</p>
      </div>

      <!-- Telemetry Cards -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <app-glass-card title="Active Sockets" icon="🔌" extraClass="border-cyan-500/10">
          <div class="text-3xl font-black text-cyan-400 mt-1">
            {{ stats().active_connections || 0 }}
          </div>
          <p class="text-[10px] text-slate-400 uppercase tracking-wider font-semibold mt-2">Concurrent TCP Channels</p>
        </app-glass-card>

        <app-glass-card title="Telemetry Requests" icon="📊" extraClass="border-purple-500/10">
          <div class="text-3xl font-black text-purple-400 mt-1">
            {{ stats().total_requests || 0 }}
          </div>
          <p class="text-[10px] text-slate-400 uppercase tracking-wider font-semibold mt-2">Aggregated Ingress Vol</p>
        </app-glass-card>

        <app-glass-card title="System Latency" icon="⚡" extraClass="border-emerald-500/10">
          <div class="text-3xl font-black text-emerald-400 mt-1">
            {{ stats().average_latency_ms ? stats().average_latency_ms.toFixed(2) + 'ms' : '0.00ms' }}
          </div>
          <p class="text-[10px] text-slate-400 uppercase tracking-wider font-semibold mt-2">Avg Execution Overhead</p>
        </app-glass-card>

        <app-glass-card title="Error Telemetry" icon="🛡️" extraClass="border-rose-500/10">
          <div class="text-3xl font-black text-rose-400 mt-1">
            {{ stats().error_rate_percent ? stats().error_rate_percent.toFixed(2) + '%' : '0.00%' }}
          </div>
          <p class="text-[10px] text-slate-400 uppercase tracking-wider font-semibold mt-2">Ingress Error Overhead</p>
        </app-glass-card>
      </div>

      <!-- Log Terminal & Dev Sandbox row -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Log Terminal takes 2 cols -->
        <div class="lg:col-span-2">
          <app-logs></app-logs>
        </div>

        <!-- Dev Sandbox takes 1 col -->
        <div>
          <app-glass-card title="Developer Token Sandbox" icon="🛠️" extraClass="border-purple-500/10">
            <div class="text-xs space-y-3">
              <p class="text-slate-400 leading-relaxed">Enforce JWT authentication for a microservice and generate test administrative authorization tokens here to bypass ingress checks.</p>
              
              <button (click)="generateToken()"
                class="w-full bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 hover:text-purple-300 border border-purple-500/20 font-bold py-2 rounded-lg transition-all duration-300">
                Generate Secure JWT Token
              </button>

              @if (jwtToken()) {
                <div class="bg-slate-950/60 border border-white/5 rounded-lg p-3 relative font-mono text-[10px] break-all leading-normal text-slate-300 select-all">
                  <div class="font-sans text-[10px] font-bold text-purple-400 mb-1 uppercase tracking-wider">Authorized JWT Token (Bearer)</div>
                  Bearer {{ jwtToken() }}
                </div>
              }
            </div>
          </app-glass-card>
        </div>
      </div>
    </div>
  `
})
export class DashboardComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);

  stats = signal<any>({});
  jwtToken = signal<string>('');
  private statsInterval: any;

  ngOnInit() {
    this.refreshStats();
    this.statsInterval = setInterval(() => this.refreshStats(), 2000);
  }

  ngOnDestroy() {
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
    }
  }

  refreshStats() {
    this.api.getStats().subscribe({
      next: (data) => this.stats.set(data || {}),
      error: (err) => console.error('Failed to poll telemetry', err)
    });
  }

  generateToken() {
    this.api.generateToken().subscribe({
      next: (res) => {
        if (res && res.token) {
          this.jwtToken.set(res.token);
        }
      },
      error: (err) => alert('Failed to sign sandbox JWT: ' + (err.error || err.message))
    });
  }
}
