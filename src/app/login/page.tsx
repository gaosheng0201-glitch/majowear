'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { login, signup } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Scissors, AlertCircle, Globe } from 'lucide-react'
import { useStudioStore } from '@/lib/store'
import { translations } from '@/lib/translations'

export default function LoginPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [isSignUp, setIsSignUp] = useState(false)

  const { language, setLanguage } = useStudioStore()
  const t = translations[language]

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    
    try {
      const result = isSignUp ? await signup(formData) : await login(formData)
      if (result?.error) {
        setError(result.error)
      } else if (result?.success) {
        router.push('/')
        router.refresh()
      }
    } catch (err: any) {
      setError(err?.message || 'An unexpected error occurred.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col justify-center items-center bg-background p-6 relative">
      {/* Language Switcher */}
      <div className="absolute top-6 right-6">
        <Button 
          variant="outline" 
          size="sm"
          onClick={() => setLanguage(language === 'zh' ? 'en' : 'zh')}
          className="flex items-center gap-1.5"
        >
          <Globe className="w-4 h-4" />
          <span>{language === 'zh' ? 'English' : '中文'}</span>
        </Button>
      </div>

      <div className="flex items-center space-x-3 mb-8">
        <Scissors className="w-8 h-8 text-primary" />
        <h1 className="text-2xl font-outfit font-bold tracking-tight">
          {t.title}
        </h1>
      </div>

      <Card className="w-full max-w-md border-border bg-card/50 backdrop-blur-md">
        <CardHeader>
          <CardTitle className="text-2xl font-outfit">
            {isSignUp ? t.createAccount : t.welcomeBack}
          </CardTitle>
          <CardDescription>
            {isSignUp ? t.signupSub : t.loginSub}
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <div className="flex items-center space-x-2 text-sm bg-destructive/15 text-destructive p-3 rounded-lg border border-destructive/20">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="email">{t.email}</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="designer@studio.com"
                required
                className="bg-muted/50"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="password">{t.password}</Label>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="••••••••"
                required
                className="bg-muted/50"
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col space-y-4">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? t.processing : isSignUp ? t.signup : t.signin}
            </Button>
            
            <Button
              type="button"
              variant="link"
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => {
                setIsSignUp(!isSignUp)
                setError(null)
              }}
            >
              {isSignUp ? t.alreadyHaveAccount : t.dontHaveAccount}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
