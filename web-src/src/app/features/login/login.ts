import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { GlassCardComponent } from '../../shared/components/glass-card/glass-card';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, GlassCardComponent],
  template: `
    <div class="min-h-screen flex items-center justify-center bg-[#070b13] p-4 relative overflow-hidden">
      <!-- Ambient Glow effects -->
      <div class="absolute -top-40 -left-40 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl"></div>
      <div class="absolute -bottom-40 -right-40 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl"></div>

      <div class="w-full max-w-md relative z-10">
        <div class="text-center mb-8">
          <div class="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-3xl font-bold mb-4 shadow-lg shadow-cyan-500/10">
            🌌
          </div>
          <h1 class="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-400">
            TS API Gateway
          </h1>
          <p class="text-slate-400 text-sm mt-2">Enter credentials to unlock control console</p>
        </div>

        <app-glass-card title="Administrator Authentication" icon="🔐">
          <form (ngSubmit)="onSubmit()" class="space-y-5">
            <div>
              <label class="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">Username / Email</label>
              <input type="email" name="username" [(ngModel)]="username" required
                class="w-full bg-slate-950/50 border border-white/10 rounded-xl px-4 py-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 transition-all duration-300"
                placeholder="administrator@domain.com">
            </div>

            <div>
              <label class="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">Security Keyphrase</label>
              <input type="password" name="password" [(ngModel)]="password" required
                class="w-full bg-slate-950/50 border border-white/10 rounded-xl px-4 py-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 transition-all duration-300"
                placeholder="••••••••••••">
            </div>

            @if (errorMsg()) {
              <div class="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs font-medium text-rose-400 flex items-center gap-2">
                ⚠️ {{ errorMsg() }}
              </div>
            }

            <button type="submit" [disabled]="loading()"
              class="w-full bg-gradient-to-r from-cyan-500 to-purple-600 hover:from-cyan-400 hover:to-purple-500 text-slate-100 font-semibold py-3 px-4 rounded-xl shadow-lg shadow-cyan-500/15 hover:shadow-cyan-500/25 transition-all duration-300 disabled:opacity-50">
              @if (loading()) {
                Verifying Credentials...
              } @else {
                Authenticate & Access Console
              }
            </button>
          </form>
        </app-glass-card>
      </div>
    </div>
  `
})
export class LoginComponent {
  private auth = inject(AuthService);
  private router = inject(Router);

  username = 'tanmaysinghx@gmail.com';
  password = 'Tanmay@1999';
  errorMsg = signal<string>('');
  loading = signal<boolean>(false);

  onSubmit() {
    if (!this.username || !this.password) {
      this.errorMsg.set('All credentials parameters are required.');
      return;
    }

    this.loading.set(true);
    this.errorMsg.set('');

    this.auth.login(this.username, this.password).subscribe({
      next: () => {
        this.router.navigate(['/']);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMsg.set(err.error?.message || 'Authentication failed. Please verify credentials.');
      }
    });
  }
}
