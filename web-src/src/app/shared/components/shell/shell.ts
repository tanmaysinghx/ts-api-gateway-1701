import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="min-h-screen bg-[#070b13] text-slate-100 flex overflow-hidden">
      
      <!-- 1. LEFT NAVIGATION SIDEBAR -->
      <aside class="w-64 bg-slate-950/40 backdrop-blur-xl border-r border-white/5 flex flex-col shrink-0 relative z-20">
        <!-- Logo Header -->
        <div class="px-6 py-5 border-b border-white/5 flex items-center gap-3">
          <span class="text-2xl animate-pulse">🌌</span>
          <div>
            <h1 class="text-sm font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-400 uppercase tracking-wider">
              TS Gateway
            </h1>
            <p class="text-[9px] text-cyan-400 font-bold uppercase tracking-wider">Control Panel</p>
          </div>
        </div>

        <!-- Navigation Lists -->
        <nav class="flex-grow p-4 space-y-2">
          <a routerLink="/dashboard" routerLinkActive="active-link" [routerLinkActiveOptions]="{exact: true}"
            class="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent transition-all duration-300 group">
            <span class="text-lg group-hover:scale-110 transition-transform duration-300">📊</span>
            <span class="text-xs font-semibold">Metrics Dashboard</span>
          </a>

          <a routerLink="/services" routerLinkActive="active-link"
            class="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent transition-all duration-300 group">
            <span class="text-lg group-hover:scale-110 transition-transform duration-300">🌐</span>
            <span class="text-xs font-semibold">Services Catalog</span>
          </a>
        </nav>

        <!-- Footer Info -->
        <div class="p-4 border-t border-white/5 text-[9px] text-slate-500 font-semibold uppercase tracking-wider space-y-1">
          <div>Engine Ver: v1.2.6</div>
          <div class="text-emerald-400">Status: Healthy</div>
        </div>
      </aside>

      <!-- 2. RIGHT CONTAINER -->
      <div class="flex-grow flex flex-col min-w-0 relative z-10 overflow-hidden">
        
        <!-- Top header -->
        <header class="h-16 bg-slate-900/30 backdrop-blur-md border-b border-white/5 px-6 flex items-center justify-between shrink-0">
          <div>
            <h2 class="text-sm font-bold text-slate-200 uppercase tracking-wider">
              System Ingress Node Console
            </h2>
          </div>

          <div class="flex items-center gap-4">
            <span class="text-[10px] font-bold text-slate-400 bg-white/5 border border-white/5 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
              <span class="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping"></span>
              Admin Account
            </span>
            <button (click)="logout()"
              class="bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 border border-rose-500/20 text-xs font-bold px-3 py-1.5 rounded-lg transition-all duration-300">
              Terminate Session
            </button>
          </div>
        </header>

        <!-- Dynamic Content Shell -->
        <main class="flex-grow overflow-y-auto p-6 min-h-0">
          <router-outlet></router-outlet>
        </main>
      </div>
    </div>
  `,
  styles: [`
    :host ::ng-deep .active-link {
      background: rgba(34, 211, 238, 0.08) !important;
      border-color: rgba(34, 211, 238, 0.2) !important;
      color: #22d3ee !important;
      box-shadow: inset 0 0 12px rgba(34, 211, 238, 0.03);
    }
  `]
})
export class ShellComponent {
  private auth = inject(AuthService);

  logout() {
    this.auth.logout();
  }
}
